import type Database from "better-sqlite3";
import type { CategoryNode } from "@/lib/domain/types";

type CategoryRow = {
  id: number;
  name: string;
  parent_id: number | null;
  level: number;
  sort_order: number;
  aliases: string;
  description: string;
  industry: string;
  is_active: number;
};

function parseAliases(aliases: string) {
  try {
    const parsed: unknown = JSON.parse(aliases);
    return Array.isArray(parsed) ? parsed.filter((alias): alias is string => typeof alias === "string") : [];
  } catch {
    return [];
  }
}

function mapRow(row: CategoryRow): CategoryNode {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    level: row.level,
    sortOrder: row.sort_order,
    aliases: parseAliases(row.aliases),
    description: row.description,
    industry: row.industry,
    isActive: row.is_active === 1,
    children: [],
  };
}

function getCategoryRowById(db: Database.Database, categoryId: number) {
  return db
    .prepare(
      `
        select id, name, parent_id, level, sort_order, aliases, description, industry, is_active
        from categories
        where id = ? and is_active = 1
      `,
    )
    .get(categoryId) as CategoryRow | undefined;
}

function assertCategoryName(name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("分类名称不能为空");
  }
  return trimmedName;
}

function siblingNameExists(db: Database.Database, name: string, parentId: number | null, excludedId?: number) {
  const excludedClause = excludedId ? "and id != @excludedId" : "";
  const row =
    parentId === null
      ? db
          .prepare(
            `
              select id
              from categories
              where name = @name and parent_id is null and is_active = 1
              ${excludedClause}
            `,
          )
          .get({ name, excludedId })
      : db
          .prepare(
            `
              select id
              from categories
              where name = @name and parent_id = @parentId and is_active = 1
              ${excludedClause}
            `,
          )
          .get({ name, parentId, excludedId });

  return row !== undefined;
}

function nextSortOrder(db: Database.Database, parentId: number | null) {
  const row =
    parentId === null
      ? (db.prepare("select coalesce(max(sort_order) + 1, 0) as sortOrder from categories where parent_id is null").get() as {
          sortOrder: number;
        })
      : (db.prepare("select coalesce(max(sort_order) + 1, 0) as sortOrder from categories where parent_id = ?").get(parentId) as {
          sortOrder: number;
        });

  return row.sortOrder;
}

export function getCategoryById(db: Database.Database, categoryId: number) {
  const row = getCategoryRowById(db, categoryId);
  return row ? mapRow(row) : undefined;
}

export function getCategoryTree(db: Database.Database): CategoryNode[] {
  const rows = db
    .prepare(
      `
        select id, name, parent_id, level, sort_order, aliases, description, industry, is_active
        from categories
        where is_active = 1
        order by level, sort_order, id
      `,
    )
    .all() as CategoryRow[];

  const nodesById = new Map<number, CategoryNode>();
  const roots: CategoryNode[] = [];

  for (const row of rows) {
    const node = mapRow(row);
    nodesById.set(node.id, node);

    if (node.parentId === null) {
      roots.push(node);
      continue;
    }

    nodesById.get(node.parentId)?.children.push(node);
  }

  return roots;
}

export function createCategory(
  db: Database.Database,
  input: {
    name: string;
    parentId?: number | null;
    description?: string;
    industry?: string;
    aliases?: string[];
  },
) {
  const name = assertCategoryName(input.name);
  const parentId = input.parentId ?? null;
  const parent = parentId === null ? undefined : getCategoryRowById(db, parentId);

  if (parentId !== null && !parent) {
    throw new Error("父级分类不存在");
  }
  if (siblingNameExists(db, name, parentId)) {
    throw new Error("同级分类已存在");
  }

  const result = db
    .prepare(
      `
        insert into categories (name, parent_id, level, sort_order, aliases, description, industry)
        values (@name, @parentId, @level, @sortOrder, @aliases, @description, @industry)
      `,
    )
    .run({
      name,
      parentId,
      level: parent ? parent.level + 1 : 0,
      sortOrder: nextSortOrder(db, parentId),
      aliases: JSON.stringify(input.aliases ?? []),
      description: input.description?.trim() ?? "",
      industry: input.industry?.trim() || parent?.industry || "",
    });

  return Number(result.lastInsertRowid);
}

export function renameCategory(db: Database.Database, categoryId: number, name: string) {
  const existing = getCategoryRowById(db, categoryId);
  if (!existing) {
    throw new Error("分类不存在");
  }

  const trimmedName = assertCategoryName(name);
  if (siblingNameExists(db, trimmedName, existing.parent_id, categoryId)) {
    throw new Error("同级分类已存在");
  }

  db.prepare("update categories set name = ?, updated_at = current_timestamp where id = ?").run(trimmedName, categoryId);
}

export function deleteCategoryBranch(db: Database.Database, categoryId: number) {
  const existing = getCategoryRowById(db, categoryId);
  if (!existing) {
    throw new Error("分类不存在");
  }

  const branchRows = db
    .prepare(
      `
        with recursive branch(id, depth) as (
          select id, 0
          from categories
          where id = ?
          union all
          select child.id, branch.depth + 1
          from categories child
          join branch on child.parent_id = branch.id
        )
        select id
        from branch
        order by depth desc
      `,
    )
    .all(categoryId) as Array<{ id: number }>;

  const remove = db.prepare("delete from categories where id = ?");
  const transaction = db.transaction(() => {
    for (const row of branchRows) {
      remove.run(row.id);
    }
  });

  transaction();
  return branchRows.length;
}

export function findCategoryByPath(db: Database.Database, path: string[]) {
  let parentId: number | null = null;
  let current: CategoryNode | undefined;

  for (const name of path) {
    const row =
      parentId === null
        ? (db
            .prepare(
              `
                select id, name, parent_id, level, sort_order, aliases, description, industry, is_active
                from categories
                where name = ? and parent_id is null and is_active = 1
              `,
            )
            .get(name) as CategoryRow | undefined)
        : (db
            .prepare(
              `
                select id, name, parent_id, level, sort_order, aliases, description, industry, is_active
                from categories
                where name = ? and parent_id = ? and is_active = 1
              `,
            )
            .get(name, parentId) as CategoryRow | undefined);

    if (!row) {
      return undefined;
    }

    current = mapRow(row);
    parentId = current.id;
  }

  return current;
}
