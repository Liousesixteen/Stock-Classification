import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { categoryRenameInputSchema } from "@/lib/domain/schemas";
import { deleteCategoryBranch, getCategoryById, renameCategory } from "@/lib/repositories/categories";
import { withApiObservability } from "@/lib/operations/observability";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function parseCategoryId(context: RouteContext) {
  const params = await context.params;
  const categoryId = Number(params.id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new Error("分类 ID 无效");
  }
  return categoryId;
}

async function patchCategory(request: NextRequest, context: RouteContext) {
  try {
    const categoryId = await parseCategoryId(context);
    const parsed = categoryRenameInputSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "分类参数无效" }, { status: 400 });
    }

    const db = getDatabase();
    renameCategory(db, categoryId, parsed.data.name);
    return NextResponse.json({ category: getCategoryById(db, categoryId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "重命名分类失败" }, { status: 400 });
  }
}

async function deleteCategory(_request: NextRequest, context: RouteContext) {
  try {
    const categoryId = await parseCategoryId(context);
    const db = getDatabase();
    const deletedCount = deleteCategoryBranch(db, categoryId);
    return NextResponse.json({ deletedCount });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除分类失败" }, { status: 400 });
  }
}

export const PATCH = withApiObservability("category.update", patchCategory, { audit: true });
export const DELETE = withApiObservability("category.delete", deleteCategory, { audit: true });
