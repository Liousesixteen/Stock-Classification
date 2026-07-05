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
