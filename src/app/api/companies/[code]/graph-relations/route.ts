import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { companyGraphEntityRelationInputSchema, stockCodeSchema } from "@/lib/domain/schemas";
import { createCompanyGraphEntityRelation, listCompanyGraphEntityRelations } from "@/lib/repositories/graphEntities";
import { withApiObservability } from "@/lib/operations/observability";

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { code } = await context.params;
  const parsedCode = stockCodeSchema.safeParse(code);
  if (!parsedCode.success) return NextResponse.json({ error: "股票代码无效" }, { status: 400 });
  return NextResponse.json({ relations: listCompanyGraphEntityRelations(getDatabase(), parsedCode.data) });
}

async function postGraphRelation(request: Request, context: RouteContext) {
  const { code } = await context.params;
  const parsedCode = stockCodeSchema.safeParse(code);
  const input = companyGraphEntityRelationInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedCode.success || !input.success) return NextResponse.json({ error: input.success ? "股票代码无效" : input.error.issues[0]?.message ?? "关系参数无效" }, { status: 400 });
  try {
    const relation = createCompanyGraphEntityRelation(getDatabase(), {
      stockCode: parsedCode.data,
      ...input.data,
      evidence: { ...input.data.evidence, credibility: input.data.evidence.credibility ?? input.data.confidence },
    });
    return NextResponse.json({ relation }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存图谱关系失败" }, { status: 400 });
  }
}

export const POST = withApiObservability("graph.relation.create", postGraphRelation, { audit: true });
