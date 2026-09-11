"use client";

import {
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Download,
  Eye,
  ExternalLink,
  FileOutput,
  FileText,
  FolderClock,
  History,
  Link2,
  LoaderCircle,
  Pencil,
  Plus,
  Quote,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TimerReset,
  X,
} from "lucide-react";
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DeepResearchResult } from "@/lib/agents/deepseekResearchAgent";
import type {
  ResearchDocumentVersion,
  ResearchReportType,
  StoredResearchDocument,
} from "@/lib/repositories/researchDocuments";
import type { IntelligenceTarget } from "./ResearchIntelligenceDock";
import type { ReportGenerationProgress } from "@/lib/research/reportGenerationProgress";
import type { ResearchReportEngine } from "@/lib/finsight/runtime";
import {
  inferFinSightReportPlan,
  REPORT_MODES,
  reportOutlineForType,
} from "@/lib/finsight/reportPlanner";

type ReportWritingWorkspaceProps = {
  target: IntelligenceTarget | null;
  report: StoredResearchDocument | null;
  reports?: StoredResearchDocument[];
  versions: ResearchDocumentVersion[];
  researchResult: DeepResearchResult | null;
  generationProgress?: ReportGenerationProgress[];
  writing: boolean;
  saving: boolean;
  rewriting: boolean;
  reportType: ResearchReportType;
  reportEngine: ResearchReportEngine;
  finSightAvailability: { available: boolean; missing: string[] } | null;
  focus: string;
  comparisonCodes: string;
  error: string;
  onReportTypeChange: (value: ResearchReportType) => void;
  onReportEngineChange: (value: ResearchReportEngine) => void;
  onFocusChange: (value: string) => void;
  onComparisonCodesChange: (value: string) => void;
  onGenerate: () => void;
  onSave: (content: string) => void;
  onRewrite: (sectionTitle: string, instruction: string) => void;
  onRestore: (versionNumber: number) => void;
  onOpenReport?: (reportId: number) => void;
  onExport: (format: "markdown" | "docx" | "pdf") => void;
  onBackToResearch: () => void;
  onAskAboutReport?: () => void;
};

export function ReportWritingWorkspace({
  target,
  report,
  reports = [],
  versions,
  researchResult,
  generationProgress = [],
  writing,
  saving,
  rewriting,
  reportType,
  reportEngine,
  finSightAvailability,
  focus,
  comparisonCodes,
  error,
  onReportTypeChange,
  onReportEngineChange,
  onFocusChange,
  onComparisonCodesChange,
  onGenerate,
  onSave,
  onRewrite,
  onRestore,
  onOpenReport,
  onExport,
  onBackToResearch,
  onAskAboutReport,
}: ReportWritingWorkspaceProps) {
  const outline = reportOutlineForType(reportType);
  const [activeSection, setActiveSection] = useState(0);
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [documentMode, setDocumentMode] = useState<"edit" | "preview">("edit");
  const [selectedSourceType, setSelectedSourceType] = useState("");
  const [rewriteInstruction, setRewriteInstruction] = useState("压缩冗余表达，强化事实与判断分离，保留全部有效引用");
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setActiveSection(0);
    setDraftMarkdown(report?.markdown ?? "");
  }, [report?.id, report?.currentVersion, report?.markdown, reportType]);

  const sectionTitle = outline[activeSection] ?? outline[0]!;
  const sectionContent = extractSection(draftMarkdown, sectionTitle);
  const dirty = Boolean(report && draftMarkdown !== report.markdown);
  const company = target?.companyName || "研究标的";
  const currentReportType = REPORT_MODES.find((item) => item.value === reportType) ?? REPORT_MODES[0]!;
  const inferredPlan = useMemo(() => inferFinSightReportPlan({
    question: focus,
    targetType: target?.targetType,
    stockCode: target?.stockCode,
    comparisonCodes: comparisonCodes.split(/[\s,，、;；]+/).filter(Boolean),
  }), [comparisonCodes, focus, target?.stockCode, target?.targetType]);
  const sourceGroups = useMemo(() => {
    const groups = new Map<string, number>();
    for (const citation of report?.citations ?? []) groups.set(citation.sourceType, (groups.get(citation.sourceType) ?? 0) + 1);
    return [...groups.entries()].sort((left, right) => right[1] - left[1]);
  }, [report?.citations]);
  const latestProgress = generationProgress.at(-1);
  const generationPercent = latestProgress ? Math.round(latestProgress.step / latestProgress.totalSteps * 100) : 0;
  const citationRecency = useMemo(() => summarizeCitationRecency(report?.citations ?? []), [report?.citations]);
  const selectedCitations = useMemo(
    () => selectedSourceType ? (report?.citations ?? []).filter((citation) => citation.sourceType === selectedSourceType) : [],
    [report?.citations, selectedSourceType],
  );
  const visibleReports = useMemo(() => {
    const normalized = historyQuery.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return reports;
    return reports.filter((item) => `${item.title} ${item.subjectLabel} ${item.stockCode}`.toLocaleLowerCase("zh-CN").includes(normalized));
  }, [historyQuery, reports]);

  const updateSection = (content: string) => {
    setDraftMarkdown((current) => replaceSection(current || report?.markdown || "", sectionTitle, content));
  };

  const wrapSelection = (before: string, after = before) => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const next = `${sectionContent.slice(0, start)}${before}${sectionContent.slice(start, end)}${after}${sectionContent.slice(end)}`;
    updateSection(next);
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start + before.length, end + before.length);
    });
  };

  return <div className="report-studio" aria-label="研报写作工作台">
    {writing ? <div className="report-generation-strip" aria-live="polite"><span><LoaderCircle className="animate-spin" /></span><div><b>{latestProgress?.message ?? "正在启动研报生成流水线"}</b><small>{latestProgress?.detail ?? "正在准备研究目标、证据目录与章节结构"}</small></div><em>{generationPercent}%</em><i><b style={{ width: `${generationPercent}%` }} /></i></div> : null}

    <div className="report-studio-grid">
      <aside className="report-studio-history" aria-label="历史研报">
        <header><div><span>REPORT LIBRARY</span><h2>历史研报</h2></div><b>{reports.length}</b></header>
        <label className="report-history-search"><Search /><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="搜索公司、主题或代码" /></label>
        <div className="report-history-list">
          {visibleReports.map((item) => <button type="button" key={item.id} className={item.id === report?.id ? "is-active" : ""} onClick={() => onOpenReport?.(item.id)}>
            <span className={`report-history-type is-${item.reportType}`}>{reportTypeLabel(item.reportType)}</span>
            <strong>{item.title}</strong>
            <small>{item.subjectLabel}{item.stockCode ? ` · ${item.stockCode}` : ""}</small>
            <footer><time>{formatReportDate(item.updatedAt)}</time><span>{item.citations.length} 引用 · {item.quality.score} 分</span></footer>
          </button>)}
          {!visibleReports.length ? <div className="report-history-empty"><FolderClock /><b>{historyQuery ? "没有匹配的研报" : "还没有历史研报"}</b><span>{historyQuery ? "换一个公司名称或关键词试试" : "完成首份报告后会自动沉淀在这里"}</span></div> : null}
        </div>
        <button type="button" className="report-history-new" onClick={onGenerate} disabled={writing}><Plus />{writing ? "报告生成中" : "生成一份新研报"}</button>
      </aside>

      <section className="report-studio-editor" aria-label="报告编辑区">
        <section className="report-compose-panel" aria-label="研报生成设置">
          <div className="report-question-heading">
            <div><span>ASK STAR ATLAS</span><h2>{report ? "继续追问并更新研报" : "你想研究什么？"}</h2></div>
            {report ? <div className="report-document-actions">
              <button type="button" onClick={onBackToResearch}>AI 研判</button>
              <button type="button" onClick={onAskAboutReport} disabled={!onAskAboutReport}><Send />追问</button>
              <button type="button" onClick={() => dirty && onSave(draftMarkdown)} disabled={!dirty || saving}>{saving ? <LoaderCircle className="animate-spin" /> : <Save />}{saving ? "保存中" : "保存"}</button>
              <button type="button" className={showHistory ? "is-active" : ""} onClick={() => setShowHistory((value) => !value)}><History />版本</button>
            </div> : null}
          </div>
          <div className="report-question-input">
            <Sparkles />
            <textarea value={focus} onChange={(event) => onFocusChange(event.target.value)} rows={2} placeholder="例如：降息周期会如何影响银行板块？请比较招商银行与宁波银行的盈利弹性和估值风险。" />
            <button type="button" className="report-generate-primary" onClick={onGenerate} disabled={writing}>{writing ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{writing ? `${generationPercent}% 生成中` : report ? "更新研报" : "生成研报"}</button>
          </div>
          {error ? <p className="report-question-error"><CircleAlert />{error}</p> : null}
          <div className="report-route-bar">
            <div className="report-route-result"><span>自动识别</span><b>{currentReportType.label}</b><small>{reportType === inferredPlan.reportType ? inferredPlan.rationale : "已按你的选择调整研究路径"}</small></div>
            <div className="report-type-tabs" aria-label="调整研报类型">
              {REPORT_MODES.map((item) => <button type="button" key={item.value} className={reportType === item.value ? "is-active" : ""} onClick={() => onReportTypeChange(item.value)} title={item.description}>{item.label}</button>)}
            </div>
            <div className="report-engine-picker" aria-label="研报生成引擎">
              <button type="button" className={reportEngine === "finsight" ? "is-active" : ""} onClick={() => onReportEngineChange("finsight")} disabled={finSightAvailability?.available === false}><Sparkles /><span><b>星图多智能体</b><small>{finSightAvailability === null ? "检测中" : finSightAvailability.available ? "完整流水线" : `待配置 ${finSightAvailability.missing.length} 项`}</small></span></button>
              <button type="button" className={reportEngine === "native" ? "is-active" : ""} onClick={() => onReportEngineChange("native")}><ShieldCheck /><span><b>证据约束备用</b><small>快速生成</small></span></button>
            </div>
          </div>
          {reportType === "comparison" ? <label className="report-comparison-input"><span>对比公司代码</span><input value={comparisonCodes} onChange={(event) => onComparisonCodesChange(event.target.value)} placeholder="例如：300346, 002156" /></label> : null}
        </section>

        {report ? <div className="report-mobile-controls" aria-label="移动端报告操作">
          <label>
            <span>章节</span>
            <select value={activeSection} onChange={(event) => setActiveSection(Number(event.target.value))}>
              {outline.map((section, index) => <option key={section} value={index}>{String(index + 1).padStart(2, "0")} {section}</option>)}
            </select>
          </label>
          <div>
            <button type="button" onClick={() => dirty && onSave(draftMarkdown)} disabled={!dirty || saving} aria-label="保存报告版本">{saving ? <LoaderCircle className="animate-spin" /> : <Save />}保存</button>
            <button type="button" onClick={() => onRewrite(sectionTitle, rewriteInstruction)} disabled={!report || rewriting} aria-label={`AI 改写${sectionTitle}`}>{rewriting ? <LoaderCircle className="animate-spin" /> : <Sparkles />}改写</button>
            <button type="button" className={showHistory ? "is-active" : ""} onClick={() => setShowHistory((value) => !value)} aria-expanded={showHistory}><History />版本</button>
          </div>
          <div className="report-mobile-exports" aria-label="导出报告">
            <button type="button" aria-label="移动端导出 Markdown 报告" disabled={!report} onClick={() => onExport("markdown")}><Download />Markdown</button>
            <button type="button" aria-label="移动端导出 Word 报告" disabled={!report} onClick={() => onExport("docx")}><FileOutput />Word</button>
            <button type="button" aria-label="移动端导出 PDF 报告" disabled={!report} onClick={() => onExport("pdf")}><FileText />PDF</button>
          </div>
        </div> : null}

        {showHistory ? <div className="report-mobile-history" aria-label="移动端版本历史">
          <header><b>版本历史</b><span>{versions.length} 个可追溯版本</span></header>
          <div className="report-version-list">{versions.map((version) => <button type="button" key={version.id} className={version.versionNumber === report?.currentVersion ? "is-current" : ""} onClick={() => version.versionNumber !== report?.currentVersion && onRestore(version.versionNumber)}><i>V{version.versionNumber}</i><span><b>{version.changeSummary}</b><small>{versionSourceLabel(version.source)} · {formatReportDate(version.createdAt)}</small></span>{version.versionNumber === report?.currentVersion ? <CheckCircle2 /> : <RefreshCw />}</button>)}{versions.length === 0 ? <p>生成报告后自动建立版本记录。</p> : null}</div>
        </div> : null}

        {report && documentMode === "edit" ? <nav className="report-section-tabs" aria-label="研报章节">
          {outline.map((section, index) => <button type="button" key={section} className={activeSection === index ? "is-active" : ""} onClick={() => setActiveSection(index)}><span>{String(index + 1).padStart(2, "0")}</span>{section}{draftMarkdown.includes(`## ${section}`) ? <CheckCircle2 /> : null}</button>)}
        </nav> : null}

        {report ? <div className="report-rich-toolbar" role="toolbar" aria-label="Markdown 格式工具">
          <button type="button" onClick={() => wrapSelection("**")} title="加粗"><b>B</b></button>
          <button type="button" onClick={() => wrapSelection("*")} title="斜体"><i>I</i></button>
          <button type="button" onClick={() => wrapSelection("[", "](https://)")} title="链接"><Link2 /></button>
          <button type="button" onClick={() => wrapSelection("\n- ", "")} title="列表">• List</button>
          <div className="report-view-toggle" aria-label="报告查看方式"><button type="button" className={documentMode === "edit" ? "is-active" : ""} onClick={() => setDocumentMode("edit")}><Pencil />章节编辑</button><button type="button" className={documentMode === "preview" ? "is-active" : ""} onClick={() => setDocumentMode("preview")}><Eye />整篇预览</button></div>
          <span>{documentMode === "edit" ? "Markdown 章节编辑" : "出版级阅读预览"}</span>
        </div> : null}

        <article className="report-document">
          {writing && !report ? <ReportGenerationCanvas progress={generationProgress} outline={outline} /> : documentMode === "preview" && report ? <div className="report-full-preview"><header><span>RESEARCH REPORT / 研究报告</span><h1>{report.title}</h1><p>{report.executiveSummary}</p><small>版本 V{report.currentVersion} · {report.citations.length} 条有效引用 · 质量评分 {report.quality.score}/100</small></header><MarkdownBody markdown={draftMarkdown} />{report.charts.map((chart) => <ReportChart key={chart.id} chart={chart} />)}</div> : <>
          {report ? <>
            <div className="report-document-section-head"><span>{String(activeSection + 1).padStart(2, "0")}</span><h2>{sectionTitle}</h2><div><button type="button" onClick={() => onRewrite(sectionTitle, rewriteInstruction)} disabled={rewriting}>{rewriting ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{rewriting ? "改写中" : "AI 改写本节"}</button><button type="button" disabled={!report.charts.length} title={report.charts.length ? "下方展示来自结构化字段的图表" : "当前没有可追溯的结构化图表数据"}><BarChart3 />真实图表 {report.charts.length}</button></div></div>
            <label className="report-rewrite-instruction"><span>改写指令</span><input value={rewriteInstruction} onChange={(event) => setRewriteInstruction(event.target.value)} /></label>
            <textarea ref={editorRef} className="report-section-editor" value={sectionContent} onChange={(event) => updateSection(event.target.value)} aria-label={`${sectionTitle}章节正文`} />
            <div className="report-section-preview"><header>排版预览</header><MarkdownBody markdown={`## ${sectionTitle}\n\n${sectionContent}`} /></div>
            {report.charts.map((chart) => <ReportChart key={chart.id} chart={chart} />)}
          </> : <ReportEmptyDraft company={company} focus={focus} outline={outline} reportType={reportType} reportEngine={reportEngine} />}</>}
        </article>
        <footer className="report-editor-status"><span>{dirty ? <CircleAlert /> : <CheckCircle2 />}{dirty ? "修改尚未保存为新版本" : "正文与当前版本一致"}</span><span>{report?.model || "星图研报引擎"} · {report?.engine === "finsight" ? "多智能体深研流水线" : researchResult ? "联合研判增强" : "引用约束写作"}</span></footer>
      </section>

      <aside className="report-studio-quality">
        <section className="report-quality-sources">
          <header><h3>引用与质检</h3><span>{report?.citations.length ?? 0} 条有效引用</span></header>
          <h4>真实来源分布</h4>
          {sourceGroups.map(([label, count]) => <SourceRow key={label} label={label} count={count} active={selectedSourceType === label} onClick={() => setSelectedSourceType((value) => value === label ? "" : label)} />)}
          {sourceGroups.length === 0 ? <p className="report-quality-empty">当前报告没有通过校验的引用。</p> : null}
          {selectedSourceType ? <div className="report-source-detail"><header><b>{selectedSourceType}</b><button type="button" onClick={() => setSelectedSourceType("")} aria-label="关闭引用详情"><X /></button></header>{selectedCitations.map((citation) => <article key={citation.id}><span>{citation.id}</span><b>{citation.title}</b><small>{citation.sourceDate || "日期待补"} · 可信度 {citation.credibility}</small>{citation.url ? <a href={citation.url} target="_blank" rel="noreferrer">查看原文 <ExternalLink /></a> : null}</article>)}</div> : null}
        </section>

        <section className="report-freshness-card">
          <header><h4>证据时效（近 12 个月）</h4><span><TimerReset />自动计算</span></header>
          <div><div className="report-freshness-ring" style={{ "--freshness": citationRecency.freshPercent } as React.CSSProperties}><b>{citationRecency.freshPercent}%</b><small>近年证据</small></div><ul><li><i className="is-fresh" />近 3 个月 <b>{citationRecency.recent}</b></li><li><i className="is-mid" />3–6 个月 <b>{citationRecency.mid}</b></li><li><i className="is-year" />6–12 个月 <b>{citationRecency.year}</b></li><li><i className="is-old" />更早 / 待补 <b>{citationRecency.old}</b></li></ul></div>
        </section>

        <section className="report-quality-score-card">
          <h4>质量评分</h4>
          <div className="report-quality-ring" style={{ "--score": report?.quality.score ?? 0 } as React.CSSProperties}><b>{report?.quality.score ?? 0}</b><span>/100</span></div>
          <ul>
            <li><CheckCircle2 />章节完整 <b>{report?.quality.sectionCoverage ?? 0}/100</b></li>
            <li><CheckCircle2 />引用覆盖 <b>{report?.quality.citationCoverage ?? 0}/100</b></li>
            <li><CheckCircle2 />证据质量 <b>{report?.quality.evidenceQuality ?? 0}/100</b></li>
            <li><CheckCircle2 />风险披露 <b>{report?.quality.riskDisclosure ?? 0}/100</b></li>
          </ul>
        </section>

        <section className="report-quality-issues">
          <header><h4>问题与建议（{report?.quality.issues.length ?? 0}）</h4></header>
          {(report?.quality.issues ?? []).map((item) => <div key={item}><CircleAlert /><span><b>{item}</b><small>修正后保存会自动生成新版本并重新质检</small></span><button type="button" onClick={() => { setDocumentMode("edit"); setActiveSection(issueSectionIndex(item, outline)); }}>去查看</button></div>)}
          {!report ? <div><CircleAlert /><span><b>尚未生成报告</b><small>先完成目标选择与证据准备</small></span></div> : null}
        </section>

        <section className="report-export-panel">
          <h4>导出与研报管理</h4>
          {report?.engine === "finsight" ? <p>深研引擎原生制品 {report.artifacts.length} 项；优先导出原始排版文件。</p> : null}
          <div>
            <button type="button" aria-label="导出 Markdown 报告" disabled={!report} onClick={() => onExport("markdown")}><Download />Markdown</button>
            <button type="button" aria-label="导出 Word 报告" disabled={!report} onClick={() => onExport("docx")}><FileOutput />Word</button>
            <button type="button" aria-label="导出 PDF 报告" disabled={!report} onClick={() => onExport("pdf")}><FileText />PDF</button>
          </div>
          <button type="button" className="report-publish" disabled={!report}><Send />{report ? "已保存到研报历史" : "等待报告生成"}<ChevronRight /></button>
        </section>
      </aside>
    </div>
  </div>;
}

function SourceRow({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return <button type="button" className={`report-source-row ${sourceTypeClass(label)} ${active ? "is-active" : ""}`} onClick={onClick}><span><Quote /></span><b>{label}</b><em>{count}<ChevronRight /></em></button>;
}

function ReportGenerationCanvas({ progress, outline }: { progress: ReportGenerationProgress[]; outline: string[] }) {
  const latest = progress.at(-1);
  const completed = latest?.completedSections ?? 0;
  return <div className="report-generation-canvas" role="status" aria-live="polite">
    <div className="report-generation-orbit"><span><Sparkles /></span><i /><i /><i /></div>
    <header><span>STAR ATLAS PIPELINE / 深度研报流水线</span><h2>{latest?.message ?? "正在启动研报引擎"}</h2><p>{latest?.detail ?? "正在建立研究边界并准备报告结构"}</p></header>
    <section className="report-generation-steps">
      {progress.map((event) => <article key={event.phase}><span>{String(event.step).padStart(2, "0")}</span><div><b>{event.message}</b><small>{event.detail}</small></div><CheckCircle2 /></article>)}
      {!progress.length ? <article className="is-current"><span>01</span><div><b>准备研究目标</b><small>读取报告类型、研究重点与目标公司</small></div><LoaderCircle className="animate-spin" /></article> : null}
    </section>
    <div className="report-generation-chapters">{outline.map((title, index) => <span key={title} className={index < completed ? "is-done" : index === completed ? "is-current" : ""}><i>{String(index + 1).padStart(2, "0")}</i>{title}{index < completed ? <Check /> : index === completed ? <LoaderCircle className="animate-spin" /> : null}</span>)}</div>
  </div>;
}

function ReportEmptyDraft({ company, focus, outline, reportType, reportEngine }: { company: string; focus: string; outline: string[]; reportType: ResearchReportType; reportEngine: ResearchReportEngine }) {
  return <div className="report-empty-draft">
    <header><span>STAR ATLAS RESEARCH PLAN</span><h3>问题已转化为可执行的研究路径</h3><p>围绕 <b>{company}</b>，系统会动态生成采集与分析任务，再完成观点组织、引用校验、质量检查和多格式交付。</p></header>
    <div className="report-empty-blueprint">
      <article><span>01</span><div><b>问题理解</b><p>{reportTypeLabel(reportType)} · {focus || "输入问题后自动识别研究类型"}</p></div><CheckCircle2 /></article>
      <article><span>02</span><div><b>动态任务规划</b><p>{reportEngine === "finsight" ? "星图引擎自动生成采集与分析任务" : "统一档案与可信来源约束写作"}</p></div><CheckCircle2 /></article>
      <article><span>03</span><div><b>完整交付</b><p>{outline.length} 个章节 · Markdown、Word 与 PDF</p></div><CheckCircle2 /></article>
    </div>
    <div className="report-empty-chapters"><span>报告将覆盖</span><div>{outline.slice(0, 6).map((section, index) => <i key={section}>{String(index + 1).padStart(2, "0")} {section}</i>)}<i>+{Math.max(0, outline.length - 6)} 章节</i></div></div>
    <small><ShieldCheck />无依据的数字与判断不会进入正文</small>
  </div>;
}

function ReportChart({ chart }: { chart: StoredResearchDocument["charts"][number] }) {
  const numericRows = chart.rows.filter((row) => typeof row.value === "number");
  const max = Math.max(1, ...numericRows.map((row) => row.value as number));
  return <section className="report-real-chart"><header><b>{chart.title}</b><span>{chart.sourceCitationIds.join(" · ") || "来源待核"}</span></header><div>{chart.rows.map((row) => <p key={row.label}><span>{row.label}</span><i><b style={{ width: typeof row.value === "number" ? `${(row.value / max) * 100}%` : "0%" }} /></i><em>{row.value}{chart.unit}</em>{row.secondary !== undefined ? <small>毛利率 {row.secondary}{chart.unit}</small> : null}</p>)}</div></section>;
}

function MarkdownBody({ markdown }: { markdown: string }) {
  return <>{markdown.split("\n").map((line, index) => {
    if (line.startsWith("### ")) return <h4 key={index}>{line.slice(4)}</h4>;
    if (line.startsWith("## ")) return <h3 key={index}>{line.slice(3)}</h3>;
    if (line.startsWith("# ")) return <h2 key={index}>{line.slice(2)}</h2>;
    if (/^[-*]\s/.test(line)) return <li key={index}>{line.slice(2)}</li>;
    if (line.startsWith("> ")) return <blockquote key={index}>{line.slice(2)}</blockquote>;
    return line.trim() ? <p key={index}>{line}</p> : <br key={index} />;
  })}</>;
}

function extractSection(markdown: string, title: string) {
  const escaped = escapeRegExp(title);
  return markdown.match(new RegExp(`## ${escaped}\\n+([\\s\\S]*?)(?=\\n## |$)`))?.[1]?.trim() ?? "";
}

function replaceSection(markdown: string, title: string, content: string) {
  const escaped = escapeRegExp(title);
  const pattern = new RegExp(`(## ${escaped}\\n+)([\\s\\S]*?)(?=\\n## |$)`);
  return pattern.test(markdown)
    ? markdown.replace(pattern, `$1${content.trim()}\n`)
    : `${markdown.trim()}\n\n## ${title}\n\n${content.trim()}\n`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatReportDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function versionSourceLabel(value: ResearchDocumentVersion["source"]) {
  if (value === "edited") return "手动编辑";
  if (value === "rewritten") return "AI 改写";
  if (value === "restored") return "版本恢复";
  return "首次生成";
}

function reportTypeLabel(value: ResearchReportType) {
  return REPORT_MODES.find((item) => item.value === value)?.label ?? "研究报告";
}

function sourceTypeClass(label: string) {
  if (/公告|年报|招股|财报/.test(label)) return "is-filing";
  if (/券商|研报/.test(label)) return "is-broker";
  if (/行业|协会/.test(label)) return "is-industry";
  if (/财务|行情/.test(label)) return "is-financial";
  return "is-news";
}

function summarizeCitationRecency(citations: StoredResearchDocument["citations"]) {
  const now = Date.now();
  const buckets = { recent: 0, mid: 0, year: 0, old: 0, freshPercent: 0 };
  for (const citation of citations) {
    const date = new Date(citation.sourceDate);
    const ageDays = Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : Math.max(0, (now - date.getTime()) / 86_400_000);
    if (ageDays <= 92) buckets.recent += 1;
    else if (ageDays <= 184) buckets.mid += 1;
    else if (ageDays <= 366) buckets.year += 1;
    else buckets.old += 1;
  }
  const fresh = buckets.recent + buckets.mid + buckets.year;
  buckets.freshPercent = citations.length ? Math.round(fresh / citations.length * 100) : 0;
  return buckets;
}

function issueSectionIndex(issue: string, outline: string[]) {
  const preferred = /风险|反证/.test(issue)
    ? outline.findIndex((title) => /风险|反证/.test(title))
    : /引用|证据|无依据/.test(issue)
      ? outline.findIndex((title) => /事实|摘要|概览/.test(title))
      : outline.findIndex((title) => /结论|待验证/.test(title));
  return preferred >= 0 ? preferred : 0;
}
