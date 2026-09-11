import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import {
  getLatestResearchRun,
  getLatestUniversalResearchRun,
} from "@/lib/repositories/aiResearch";
import {
  ResearchRequestError,
  type ResearchRequestBody,
} from "@/lib/research/executeResearch";
import { executeDAStockResearch as executeResearch } from "@/lib/research/executeDAStockResearch";
import { withApiObservability } from "@/lib/operations/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const stockCode = params.get("stockCode")?.trim();
  if (stockCode) return NextResponse.json({ run: getLatestResearchRun(getDatabase(), stockCode) });
  const subjectType = params.get("subjectType");
  const subjectKey = params.get("subjectKey")?.trim();
  if ((subjectType === "industry" || subjectType === "question") && subjectKey) {
    return NextResponse.json({ run: getLatestUniversalResearchRun(getDatabase(), subjectType, subjectKey) });
  }
  return NextResponse.json({ error: "缺少研究目标" }, { status: 400 });
}

async function postResearch(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ResearchRequestBody;
    return NextResponse.json(await executeResearch(body, { signal: request.signal }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 研究失败";
    return NextResponse.json(
      { error: message },
      { status: error instanceof ResearchRequestError ? error.status : 502 },
    );
  }
}

export const POST = withApiObservability("ai.research.run", postResearch, { audit: true });
