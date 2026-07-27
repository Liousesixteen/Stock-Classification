import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { relationEvidenceInputSchema } from "@/lib/domain/schemas";
import { addEvidenceToRelation } from "@/lib/repositories/evidence";
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

async function postEvidence(request: NextRequest, context: RouteContext) {
  try {
    const relationId = await parseRelationId(context);
    const parsed = relationEvidenceInputSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "证据参数无效" }, { status: 400 });
    }

    const evidence = addEvidenceToRelation(getDatabase(), {
      relationId,
      sourceType: parsed.data.sourceType,
      title: parsed.data.title || parsed.data.url || "手动补充证据",
      sourceDate: parsed.data.sourceDate,
      url: parsed.data.url,
      excerpt: parsed.data.excerpt,
      credibility: parsed.data.credibility ?? "中",
      isExpired: parsed.data.isExpired,
    });

    return NextResponse.json({ evidence }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "新增证据失败" }, { status: 400 });
  }
}

export const POST = withApiObservability("relation.evidence.create", postEvidence, { audit: true });
