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

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const db = getDatabase();
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
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action === "rewrite") return rewriteSection(body);

    const reportType = parseReportType(body.reportType) ?? "company";
    const stockCode = stringValue(body.stockCode);
    const categoryId = numberValue(body.categoryId);
    const comparisonCodes = stringArray(body.comparisonStockCodes).filter((code) => /^\d{6}$/.test(code)).slice(0, 5);
    const focus = stringValue(body.focus);
    const requestedSubjectKey = stringValue(body.subjectKey);
    const requestedSubjectLabel = stringValue(body.subjectLabel);
    const db = getDatabase();
    let facts;
    let subjectKey = requestedSubjectKey;
    let subjectLabel = requestedSubjectLabel;
    let analysis = null;

    if (reportType === "company") {
      if (!/^\d{6}$/.test(stockCode)) return NextResponse.json({ error: "股票代码无效" }, { status: 400 });
      await ensureResearchCompany(db, stockCode);
      facts = buildCompanyResearchFacts(db, stockCode, categoryId);
      subjectKey = stockCode;
      subjectLabel = facts?.subject?.label ?? stockCode;
      analysis = getLatestResearchRun(db, stockCode)?.result ?? null;
    } else if (reportType === "industry") {
      if (!categoryId) return NextResponse.json({ error: "请选择有效产业分类" }, { status: 400 });
      facts = buildIndustryResearchFacts(db, categoryId);
      subjectKey = String(categoryId);
      subjectLabel = facts?.subject?.label ?? (requestedSubjectLabel || "产业研究");
      analysis = getLatestUniversalResearchRun(db, "industry", subjectKey)?.result ?? null;
    } else if (reportType === "comparison") {
      const codes = [...new Set([stockCode, ...comparisonCodes].filter((code) => /^\d{6}$/.test(code)))];
      if (codes.length < 2) return NextResponse.json({ error: "公司对比至少需要两个有效股票代码" }, { status: 400 });
      for (const code of codes) await ensureResearchCompany(db, code);
      facts = buildComparisonResearchFacts(db, codes);
      subjectKey = [...codes].sort().join("-");
      subjectLabel = facts?.subject?.label ?? "公司对比";
    } else {
      if (!focus) return NextResponse.json({ error: "事件点评需要填写事件与写作重点" }, { status: 400 });
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
    }

    if (!facts) return NextResponse.json({ error: "报告目标资料不存在" }, { status: 404 });
    const generated = await generateResearchReport(facts, analysis, { reportType, focus });
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
      status: generated.quality.score >= 75 && generated.citations.length > 0 ? "ready" : "needs_work",
      citations: generated.citations,
      quality: generated.quality,
      charts: generated.charts,
    });
    return NextResponse.json({
      report: getResearchDocument(db, id),
      versions: listResearchDocumentVersions(db, id),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "研报生成失败" }, { status: 502 });
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
  return value === "company" || value === "industry" || value === "comparison" || value === "event" ? value : null;
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
