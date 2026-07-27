import { NextResponse } from "next/server";
import { runDeepResearchTeam } from "@/lib/agents/deepseekResearchAgent";
import { getDatabase } from "@/lib/db/client";
import {
  getLatestResearchRun,
  getLatestUniversalResearchRun,
  saveResearchRun,
  saveUniversalResearchRun,
} from "@/lib/repositories/aiResearch";
import {
  buildCompanyResearchFacts,
  buildIndustryResearchFacts,
  buildOpenQuestionResearchFacts,
} from "@/lib/research/companyFacts";
import { ensureResearchCompany } from "@/lib/research/ensureResearchCompany";
import { withApiObservability } from "@/lib/operations/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const body = (await request.json().catch(() => ({}))) as {
      targetType?: unknown;
      subjectLabel?: unknown;
      subjectKey?: unknown;
      stockCode?: unknown;
      categoryId?: unknown;
      question?: unknown;
      depth?: unknown;
    };
    const targetType = body.targetType === "industry" || body.targetType === "question" ? body.targetType : "company";
    const stockCode = typeof body.stockCode === "string" ? body.stockCode.trim() : "";
    const categoryId = typeof body.categoryId === "number" ? body.categoryId : null;
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const subjectLabel = typeof body.subjectLabel === "string" ? body.subjectLabel.trim() : "";
    const subjectKey = typeof body.subjectKey === "string" ? body.subjectKey.trim() : "";
    const depth = body.depth === "quick" || body.depth === "deep" ? body.depth : "standard";
    const db = getDatabase();
    let facts;
    if (targetType === "company") {
      if (!/^\d{6}$/.test(stockCode)) return NextResponse.json({ error: "股票代码无效" }, { status: 400 });
      await ensureResearchCompany(db, stockCode);
      facts = buildCompanyResearchFacts(db, stockCode, categoryId);
    } else if (targetType === "industry") {
      if (!categoryId) return NextResponse.json({ error: "产业分类无效" }, { status: 400 });
      facts = buildIndustryResearchFacts(db, categoryId);
    } else {
      if (!question) return NextResponse.json({ error: "开放研究问题不能为空" }, { status: 400 });
      facts = buildOpenQuestionResearchFacts(question);
    }
    if (!facts) return NextResponse.json({ error: targetType === "industry" ? "产业分类不存在" : "公司不存在" }, { status: 404 });
    const result = await runDeepResearchTeam(facts, { question, depth });
    if (targetType === "company") {
      const id = saveResearchRun(db, { stockCode, categoryId, question, depth, result });
      return NextResponse.json({ run: { id, targetType, stockCode, categoryId, question, depth, status: "completed", model: result.model, result } });
    }
    const resolvedSubjectKey = subjectKey || facts.subject?.key || (targetType === "industry" ? String(categoryId) : "question");
    const resolvedSubjectLabel = subjectLabel || facts.subject?.label || question.slice(0, 80);
    const id = saveUniversalResearchRun(db, {
      subjectType: targetType,
      subjectKey: resolvedSubjectKey,
      subjectLabel: resolvedSubjectLabel,
      categoryId,
      question,
      depth,
      result,
    });
    return NextResponse.json({
      run: { id, targetType, subjectType: targetType, subjectKey: resolvedSubjectKey, subjectLabel: resolvedSubjectLabel, categoryId, question, depth, status: "completed", model: result.model, result },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 研究失败" }, { status: 502 });
  }
}

export const POST = withApiObservability("ai.research.run", postResearch, { audit: true });
