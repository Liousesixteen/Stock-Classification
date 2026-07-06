import type Database from "better-sqlite3";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { findCategoryByPath } from "@/lib/repositories/categories";
import { listRelationsForCategory } from "@/lib/repositories/relations";

type CategorySummary = {
  id: number;
  name: string;
  parentId: number | null;
};

function getCategoryById(db: Database.Database, categoryId: number) {
  return db
    .prepare(
      `
        select id, name, parent_id as parentId
        from categories
        where id = ? and is_active = 1
      `,
    )
    .get(categoryId) as CategorySummary | undefined;
}

function getDefaultCategory(db: Database.Database) {
  const category = findCategoryByPath(db, ["半导体", "材料", "光刻材料", "光刻胶", "ArF 干法/浸没式光刻胶"]);
  if (category) {
    return {
      id: category.id,
      name: category.name,
      parentId: category.parentId,
    };
  }

  return db
    .prepare(
      `
        select c.id, c.name, c.parent_id as parentId
        from categories c
        left join categories child on child.parent_id = c.id and child.is_active = 1
        where c.is_active = 1 and child.id is null
        order by c.level desc, c.sort_order, c.id
        limit 1
      `,
    )
    .get() as CategorySummary | undefined;
}

export async function GET(request: Request) {
  const db = getDatabase();
  const url = new URL(request.url);
  const rawCategoryId = url.searchParams.get("categoryId");
  const selectedCategory = rawCategoryId ? getCategoryById(db, Number(rawCategoryId)) : getDefaultCategory(db);

  if (!selectedCategory) {
    return NextResponse.json({ error: "分类不存在" }, { status: 404 });
  }

  return NextResponse.json({
    selectedCategory,
    relations: listRelationsForCategory(db, selectedCategory.id),
  });
}
