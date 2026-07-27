import type { NextRequest } from "next/server";
import { after } from "next/server";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { companyProfileInputSchema, stockCodeSchema } from "@/lib/domain/schemas";
import { buildCompanyDossierModel } from "@/lib/research/companyDossierModel";
import { runSyncTaskWithRetries } from "@/lib/research/syncTaskWorker";
import { getCompany, updateCompanyProfile } from "@/lib/repositories/companies";
import { listCompanyNotes } from "@/lib/repositories/notes";
import { listCompanyGraphEntityRelations } from "@/lib/repositories/graphEntities";
import { getLatestResearchRun } from "@/lib/repositories/aiResearch";
import { getLatestSyncTaskForStock, listSyncTasksForStock } from "@/lib/repositories/syncTasks";
import { withApiObservability } from "@/lib/operations/observability";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { code } = await context.params;
  const db = getDatabase();
  const dossier = buildCompanyDossierModel(db, code);

  if (!dossier) {
    return NextResponse.json({ error: "公司不存在" }, { status: 404 });
  }

  const latestSyncTask = getLatestSyncTaskForStock(db, code, "company_research_profile");
  if (latestSyncTask && (latestSyncTask.status === "pending" || latestSyncTask.status === "running")) {
    after(() => runSyncTaskWithRetries(latestSyncTask.id).then(() => undefined).catch(() => undefined));
  }

  return NextResponse.json({
    ...dossier,
    latestSyncTask,
    syncTasks: listSyncTasksForStock(db, code).slice(0, 8),
    notes: listCompanyNotes(db, code),
    graphEntityRelations: listCompanyGraphEntityRelations(db, code),
    latestResearchRun: getLatestResearchRun(db, code),
  });
}

async function patchCompany(request: NextRequest, context: RouteContext) {
  const { code } = await context.params;
  const parsedCode = stockCodeSchema.safeParse(code);
  if (!parsedCode.success) {
    return NextResponse.json({ error: parsedCode.error.issues[0]?.message ?? "股票代码无效" }, { status: 400 });
  }

  const parsed = companyProfileInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "公司资料无效" }, { status: 400 });
  }

  try {
    const db = getDatabase();
    updateCompanyProfile(db, {
      stockCode: parsedCode.data,
      shortName: parsed.data.shortName,
      fullName: parsed.data.fullName,
      board: parsed.data.board,
      industry: parsed.data.industry,
      region: parsed.data.region,
      marketCapBand: parsed.data.marketCapBand,
      intro: parsed.data.intro,
      mainBusiness: parsed.data.mainBusiness,
      updatedAt: "",
    });

    return NextResponse.json({ company: getCompany(db, parsedCode.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存公司资料失败" }, { status: 400 });
  }
}

export const PATCH = withApiObservability("company.profile.update", patchCompany, { audit: true });
