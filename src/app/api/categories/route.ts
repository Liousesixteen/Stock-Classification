import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { categoryCreateInputSchema } from "@/lib/domain/schemas";
import { createCategory, getCategoryById, getCategoryTree } from "@/lib/repositories/categories";

export async function GET() {
  const db = getDatabase();
  return NextResponse.json({ categories: getCategoryTree(db) });
}

export async function POST(request: NextRequest) {
  const parsed = categoryCreateInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "分类参数无效" }, { status: 400 });
  }

  try {
    const db = getDatabase();
    const categoryId = createCategory(db, parsed.data);
    return NextResponse.json({ category: getCategoryById(db, categoryId) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建分类失败" }, { status: 400 });
  }
}
