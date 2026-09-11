import { NextResponse } from "next/server";
import {
  evaluateResearchReport,
  generateResearchReport,
  rewriteResearchReportSection,
} from "@/lib/agents/deepseekResearchAgent";
import { getDatabase } from "@/lib/db/client";
import { getLatestResearchReport, getLatestResearchRun, getLatestUniversalResearchRun } from "@/lib/repositories/aiResearch";
import {
  createResearchDocument,
  getLatestResearchDocument,
  getResearchDocument,
  listResearchDocuments,
  listResearchDocumentVersions,
  saveResearchDocumentVersion,
  type ResearchReportType,
} from "@/lib/repositories/researchDocuments";
import {
  buildCompanyResearchFacts,
  buildComparisonResearchFacts,
  buildIndustryResearchFacts,
  buildOpenQuestionResearchFacts,
} from "@/lib/research/companyFacts";
import { ensureResearchCompany } from "@/lib/research/ensureResearchCompany";
import { withApiObservability } from "@/lib/operations/observability";
import { createReportProgress, type ReportGenerationProgress } from "@/lib/research/reportGenerationProgress";
import { runFinSightReport, type ResearchReportEngine } from "@/lib/finsight/runtime";
import { inferFinSightReportPlan, reportOutlineForType } from "@/lib/finsight/reportPlanner";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const db = getDatabase();
  if (params.get("scope") === "history") {
    return NextResponse.json({ reports: listResearchDocuments(db).slice(0, 50) });
  }
  const reportId = Number(params.get("id"));
  if (Number.isInteger(reportId) && reportId > 0) {
    const report = getResearchDocument(db, reportId);
    if (!report) return NextResponse.json({ error: "研究报告不存在" }, { status: 404 });
    return NextResponse.json({ report, versions: listResearchDocumentVersions(db, reportId) });
  }

  const reportType = parseReportType(params.get("reportType"));
  const subjectKey = params.get("subjectKey")?.trim();
  if (reportType && subjectKey) {
    const report = getLatestResearchDocument(db, reportType, subjectKey);
    return NextResponse.json({ report, versions: report ? listResearchDocumentVersions(db, report.id) : [] });
  }

  const stockCode = params.get("stockCode")?.trim();
  if (!stockCode) return NextResponse.json({ error: "缺少报告目标" }, { status: 400 });
  const report = getLatestResearchDocument(db, "company", stockCode);
  if (report) return NextResponse.json({ report, versions: listResearchDocumentVersions(db, report.id) });
  return NextResponse.json({ report: getLatestResearchReport(db, stockCode), versions: [] });
}

async function postReport(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action === "rewrite") return rewriteSection(body);
  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    return streamGeneratedReport(body, request.signal);
  }
  try {
    return NextResponse.json(await generateReportPayload(body, undefined, request.signal));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "研报生成失败" },
      { status: error instanceof ReportRequestError ? error.status : 502 },
    );
  }
}

async function generateReportPayload(
  body: Record<string, unknown>,
  onProgress?: (event: ReportGenerationProgress) => void,
  signal?: AbortSignal,
) {
  const stockCode = stringValue(body.stockCode);
  const comparisonCodes = stringArray(body.comparisonStockCodes).filter((code) => /^\d{6}$/.test(code)).slice(0, 5);
  const focus = stringValue(body.focus);
  const plan = inferFinSightReportPlan({
    question: focus,
    targetType: parseSubjectType(body.subjectType),
    stockCode,
    comparisonCodes,
    preferredType: parseReportType(body.reportType),
  });
  const reportType = plan.reportType;
  const engine = parseReportEngine(body.engine);
  const categoryId = numberValue(body.categoryId);
  const requestedSubjectKey = stringValue(body.subjectKey);
  const requestedSubjectLabel = stringValue(body.subjectLabel);
  const db = getDatabase();
  let facts;
  let subjectKey = requestedSubjectKey;
  let subjectLabel = requestedSubjectLabel;
  let analysis = null;

  onProgress?.(createReportProgress({
    phase: "preparing",
    step: 1,
    message: "正在锁定研究目标与报告口径",
    detail: `${plan.label} · ${plan.rationale}`,
    reportType,
    completedSections: 0,
    totalSections: reportOutlineForType(reportType).length,
  }));

  if (reportType === "company") {
    if (!/^\d{6}$/.test(stockCode)) throw new ReportRequestError("股票代码无效", 400);
    await ensureResearchCompany(db, stockCode);
    facts = buildCompanyResearchFacts(db, stockCode, categoryId);
    subjectKey = stockCode;
    subjectLabel = facts?.subject?.label ?? stockCode;
    analysis = getLatestResearchRun(db, stockCode)?.result ?? null;
  } else if (reportType === "industry") {
    if (!categoryId) throw new ReportRequestError("请选择有效产业分类", 400);
    facts = buildIndustryResearchFacts(db, categoryId);
    subjectKey = String(categoryId);
    subjectLabel = facts?.subject?.label ?? (requestedSubjectLabel || "产业研究");
    analysis = getLatestUniversalResearchRun(db, "industry", subjectKey)?.result ?? null;
  } else if (reportType === "comparison") {
    const codes = [...new Set([stockCode, ...comparisonCodes].filter((code) => /^\d{6}$/.test(code)))];
    if (codes.length < 2) throw new ReportRequestError("公司对比至少需要两个有效股票代码", 400);
    for (const code of codes) await ensureResearchCompany(db, code);
    facts = buildComparisonResearchFacts(db, codes);
    subjectKey = [...codes].sort().join("-");
    subjectLabel = facts?.subject?.label ?? "公司对比";
  } else if (reportType === "event") {
    if (!focus) throw new ReportRequestError("请填写需要研究的事件与核心问题", 400);
    if (/^\d{6}$/.test(stockCode)) {
      await ensureResearchCompany(db, stockCode);
      facts = buildCompanyResearchFacts(db, stockCode, categoryId);
      analysis = getLatestResearchRun(db, stockCode)?.result ?? null;
    } else if (categoryId) {
      facts = buildIndustryResearchFacts(db, categoryId);
      analysis = getLatestUniversalResearchRun(db, "industry", String(categoryId))?.result ?? null;
    } else {
      facts = buildOpenQuestionResearchFacts(focus);
    }
    subjectKey = requestedSubjectKey || `event-${stableKey(focus)}`;
    subjectLabel = requestedSubjectLabel || facts?.subject?.label || "事件点评";
  } else {
    if (!focus) throw new ReportRequestError("请描述希望研究的问题", 400);
    facts = buildOpenQuestionResearchFacts(focus);
    subjectKey = requestedSubjectKey || `${reportType}-${stableKey(focus)}`;
    subjectLabel = requestedSubjectLabel || (reportType === "macro" ? "宏观研究" : conciseSubjectLabel(focus));
    analysis = getLatestUniversalResearchRun(db, "question", requestedSubjectKey || stableKey(focus))?.result ?? null;
  }

  if (!facts) throw new ReportRequestError("报告目标资料不存在", 404);
  const generated = engine === "finsight"
    ? await generateWithFinSight({ reportType, targetType: plan.targetType, subjectLabel, stockCode, focus, onProgress, signal })
    : await generateResearchReport(facts, analysis, { reportType, focus, onProgress });
  const id = createResearchDocument(db, {
    reportType,
    subjectKey,
    subjectLabel,
    stockCode: /^\d{6}$/.test(stockCode) ? stockCode : "",
    categoryId,
    comparisonCodes,
    title: generated.title,
    executiveSummary: generated.executiveSummary,
    markdown: generated.markdown,
    model: generated.model,
    engine,
    status: generated.quality.score >= 75 && generated.citations.length > 0 ? "ready" : "needs_work",
    citations: generated.citations,
    quality: generated.quality,
    charts: generated.charts,
    artifacts: engine === "finsight"
      ? (generated as Awaited<ReturnType<typeof generateWithFinSight>>).artifacts
      : [],
  });
  const payload = {
    report: getResearchDocument(db, id),
    versions: listResearchDocumentVersions(db, id),
  };
  onProgress?.(createReportProgress({
    phase: "complete",
    step: engine === "finsight" ? 8 : 7,
    totalSteps: engine === "finsight" ? 8 : 7,
    message: "研报已生成并建立首个版本",
    detail: "报告已保存到研报历史，可继续改写、质检或导出",
    reportType,
    citationCount: generated.citations.length,
    completedSections: reportOutlineForType(reportType).length,
    totalSections: reportOutlineForType(reportType).length,
  }));
  return payload;
}

function streamGeneratedReport(body: Record<string, unknown>, signal?: AbortSignal) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      void generateReportPayload(body, (event) => send({ type: "progress", event }), signal)
        .then((payload) => {
          send({ type: "complete", ...payload });
          controller.close();
        })
        .catch((error) => {
          send({ type: "error", error: error instanceof Error ? error.message : "研报生成失败" });
          controller.close();
        });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

class ReportRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ReportRequestError";
  }
}

async function patchReport(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const reportId = numberValue(body.reportId);
    if (!reportId) return NextResponse.json({ error: "报告编号无效" }, { status: 400 });
    const db = getDatabase();
    const report = getResearchDocument(db, reportId);
    if (!report) return NextResponse.json({ error: "研究报告不存在" }, { status: 404 });

    let content = stringValue(body.content);
    let source: "edited" | "restored" = "edited";
    let changeSummary = stringValue(body.changeSummary) || "手动编辑";
    if (body.action === "restore") {
      const versionNumber = numberValue(body.versionNumber);
      const version = listResearchDocumentVersions(db, reportId).find((item) => item.versionNumber === versionNumber);
      if (!version) return NextResponse.json({ error: "历史版本不存在" }, { status: 404 });
      content = version.content;
      source = "restored";
      changeSummary = `恢复版本 V${version.versionNumber}`;
    }
    if (!content.trim()) return NextResponse.json({ error: "报告正文不能为空" }, { status: 400 });
    const quality = evaluateResearchReport(content, report.citations, report.reportType);
    saveResearchDocumentVersion(db, { reportId, content, changeSummary, source, quality });
    return NextResponse.json({
      report: getResearchDocument(db, reportId),
      versions: listResearchDocumentVersions(db, reportId),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "报告保存失败" }, { status: 400 });
  }
}

export const POST = withApiObservability("ai.report.generate", postReport, { audit: true });
export const PATCH = withApiObservability("ai.report.update", patchReport, { audit: true });

async function rewriteSection(body: Record<string, unknown>) {
  const reportId = numberValue(body.reportId);
  const sectionTitle = stringValue(body.sectionTitle);
  const instruction = stringValue(body.instruction) || "提升表达清晰度，保留事实与引用边界";
  if (!reportId || !sectionTitle) return NextResponse.json({ error: "缺少报告或章节参数" }, { status: 400 });
  const db = getDatabase();
  const report = getResearchDocument(db, reportId);
  if (!report) return NextResponse.json({ error: "研究报告不存在" }, { status: 404 });
  const rewritten = await rewriteResearchReportSection({
    markdown: report.markdown,
    sectionTitle,
    instruction,
    citations: report.citations,
  });
  const quality = evaluateResearchReport(
    rewritten.markdown,
    report.citations,
    report.reportType,
    rewritten.unsupportedClaimCount,
  );
  saveResearchDocumentVersion(db, {
    reportId,
    content: rewritten.markdown,
    changeSummary: `AI 改写：${sectionTitle}`,
    source: "rewritten",
    model: rewritten.model,
    quality,
  });
  return NextResponse.json({
    report: getResearchDocument(db, reportId),
    versions: listResearchDocumentVersions(db, reportId),
  });
}

function parseReportType(value: unknown): ResearchReportType | null {
  return value === "company" || value === "industry" || value === "macro" || value === "comparison" || value === "event" || value === "general" ? value : null;
}

function parseSubjectType(value: unknown) {
  return value === "company" || value === "industry" || value === "question" ? value : null;
}

function parseReportEngine(value: unknown): ResearchReportEngine {
  if (value === "finsight" || value === "native") return value;
  return process.env.FINSIGHT_REPORT_ENGINE === "finsight" ? "finsight" : "native";
}

async function generateWithFinSight(input: {
  reportType: ResearchReportType;
  targetType: ReturnType<typeof inferFinSightReportPlan>["targetType"];
  subjectLabel: string;
  stockCode: string;
  focus: string;
  onProgress?: (event: ReportGenerationProgress) => void;
  signal?: AbortSignal;
}) {
  const result = await runFinSightReport({
    reportType: input.reportType,
    targetName: input.subjectLabel,
    stockCode: input.stockCode,
    focus: input.focus,
    targetType: input.targetType,
    onProgress: input.onProgress,
    signal: input.signal,
  });
  return {
    ...result,
    quality: evaluateResearchReport(result.markdown, result.citations, input.reportType),
    charts: [],
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()) : [];
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function conciseSubjectLabel(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 28 ? `${normalized.slice(0, 28)}…` : normalized || "开放研究";
}
