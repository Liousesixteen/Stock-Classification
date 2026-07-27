import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { lookupFastStockProfile } from "@/lib/datasources/stockLookup";
import { getDatabase } from "@/lib/db/client";
import { stockCodeSchema } from "@/lib/domain/schemas";
import { enqueueCompanyProfileSyncTask } from "@/lib/research/companySyncQueue";
import { runSyncTaskWithRetries } from "@/lib/research/syncTaskWorker";
import { getCompany, upsertCompany } from "@/lib/repositories/companies";
import { withApiObservability } from "@/lib/operations/observability";

const requestSchema = z.object({
  categoryId: z.number().int().positive().optional(),
  force: z.boolean().optional(),
});

type RouteContext = {
  params: Promise<{ code: string }>;
};

async function postCompanySync(request: Request, context: RouteContext) {
  const { code } = await context.params;
  const parsedCode = stockCodeSchema.safeParse(code);
  if (!parsedCode.success) {
    return NextResponse.json({ error: parsedCode.error.issues[0]?.message ?? "股票代码无效" }, { status: 400 });
  }

  const parsedBody = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues[0]?.message ?? "同步参数无效" }, { status: 400 });
  }

  const db = getDatabase();
  if (!getCompany(db, parsedCode.data)) {
    try {
      const profile = lookupFastStockProfile(parsedCode.data);
      upsertCompany(db, {
        stockCode: profile.stockCode,
        shortName: profile.shortName,
        fullName: profile.fullName,
        board: profile.board,
        industry: profile.industry,
        region: profile.region,
        marketCapBand: profile.marketCapBand,
        intro: profile.intro,
        mainBusiness: profile.mainBusiness,
        updatedAt: "",
      });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "股票不存在" }, { status: 404 });
    }
  }

  const queued = enqueueCompanyProfileSyncTask(db, {
    stockCode: parsedCode.data,
    categoryId: parsedBody.data.categoryId,
    force: parsedBody.data.force,
  });

  if (queued.task.status === "pending" || queued.task.status === "running") {
    after(async () => {
      await runSyncTaskWithRetries(queued.task.id).catch(() => undefined);
    });
  }

  return NextResponse.json(
    {
      task: queued.task,
      deduplicated: queued.deduplicated,
    },
    { status: 202 },
  );
}

export const POST = withApiObservability("company.sync.enqueue", postCompanySync, { audit: true });
