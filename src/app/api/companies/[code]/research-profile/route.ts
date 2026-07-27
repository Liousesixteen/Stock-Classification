import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { companyResearchProfileInputSchema, stockCodeSchema } from "@/lib/domain/schemas";
import { getCompanyResearchProfile, upsertCompanyResearchProfile } from "@/lib/repositories/researchProfiles";
import { withApiObservability } from "@/lib/operations/observability";

type RouteContext = {
  params: Promise<{ code: string }>;
};

async function patchResearchProfile(request: NextRequest, context: RouteContext) {
  const { code } = await context.params;
  const parsedCode = stockCodeSchema.safeParse(code);
  if (!parsedCode.success) {
    return NextResponse.json({ error: parsedCode.error.issues[0]?.message ?? "股票代码无效" }, { status: 400 });
  }

  const parsed = companyResearchProfileInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "结构化资料无效" }, { status: 400 });
  }

  const db = getDatabase();
  upsertCompanyResearchProfile(db, {
    stockCode: parsedCode.data,
    summary: parsed.data.summary,
    businessLines: parsed.data.businessLines,
    chainPosition: parsed.data.chainPosition,
    competitiveAdvantages: parsed.data.competitiveAdvantages,
    keyCustomers: parsed.data.keyCustomers,
    catalysts: parsed.data.catalysts,
    risks: parsed.data.risks,
    sourceSummary: parsed.data.sourceSummary,
  });

  return NextResponse.json({ researchProfile: getCompanyResearchProfile(db, parsedCode.data) });
}

export const PATCH = withApiObservability("company.research-profile.update", patchResearchProfile, { audit: true });
