import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { deleteRelation } from "@/lib/repositories/relations";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function parseRelationId(context: RouteContext) {
  const params = await context.params;
  const relationId = Number(params.id);
  if (!Number.isInteger(relationId) || relationId <= 0) {
    throw new Error("关系 ID 无效");
  }
  return relationId;
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const relationId = await parseRelationId(context);
    const deletedCount = deleteRelation(getDatabase(), relationId);
    if (deletedCount === 0) {
      return NextResponse.json({ error: "关系不存在" }, { status: 404 });
    }

    return NextResponse.json({ deletedCount });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除关系失败" }, { status: 400 });
  }
}
