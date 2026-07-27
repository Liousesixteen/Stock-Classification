import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { deleteRelation, setRelationWatchlist } from "@/lib/repositories/relations";
import { withApiObservability } from "@/lib/operations/observability";

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

async function deleteRelationRoute(_request: Request, context: RouteContext) {
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

async function patchRelation(request: Request, context: RouteContext) {
  try {
    const relationId = await parseRelationId(context);
    const input = (await request.json().catch(() => ({}))) as { isWatchlist?: unknown };
    if (typeof input.isWatchlist !== "boolean") return NextResponse.json({ error: "关注状态无效" }, { status: 400 });
    const changed = setRelationWatchlist(getDatabase(), relationId, input.isWatchlist);
    if (!changed) return NextResponse.json({ error: "关系不存在" }, { status: 404 });
    return NextResponse.json({ relationId, isWatchlist: input.isWatchlist });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新关注状态失败" }, { status: 400 });
  }
}

export const DELETE = withApiObservability("relation.delete", deleteRelationRoute, { audit: true });
export const PATCH = withApiObservability("relation.update", patchRelation, { audit: true });
