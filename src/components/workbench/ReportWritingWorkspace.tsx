"use client";

import {
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Download,
  FileOutput,
  FileText,
  History,
  Link2,
  LoaderCircle,
  Quote,
  RefreshCw,
  Save,
  Send,
  Sparkles,
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

const REPORT_OUTLINES: Record<ResearchReportType, string[]> = {
  company: ["投资摘要", "公司概览", "主营业务与收入构成", "产业链位置", "竞争优势", "财务与估值", "催化因素", "风险与反证", "结论与待验证事项"],
  industry: ["研究摘要", "赛道定义与边界", "产业链结构", "供需与景气", "竞争格局与公司映射", "催化因素", "风险与反证", "跟踪指标与结论"],
  comparison: ["对比摘要", "公司与业务口径", "产业链位置对比", "经营与财务对比", "竞争优势对比", "催化因素对比", "风险与反证", "结论与待验证事项"],
  event: ["事件摘要", "事实与证据", "影响传导路径", "公司与产业链影响", "情景分析", "后续跟踪节点", "风险与反证", "结论"],
};

const REPORT_TYPES: Array<{ value: ResearchReportType; title: string; detail: string }> = [
  { value: "company", title: "公司深度", detail: "业务、产业链、财务与风险" },
  { value: "industry", title: "赛道研究", detail: "供需、格局与公司映射" },
  { value: "comparison", title: "公司对比", detail: "同口径横向比较" },
  { value: "event", title: "事件点评", detail: "事实、传导与情景" },
];

type ReportWritingWorkspaceProps = {
  target: IntelligenceTarget | null;
  report: StoredResearchDocument | null;
  versions: ResearchDocumentVersion[];
  researchResult: DeepResearchResult | null;
  writing: boolean;
  saving: boolean;
  rewriting: boolean;
  reportType: ResearchReportType;
  focus: string;
  comparisonCodes: string;
  error: string;
  onReportTypeChange: (value: ResearchReportType) => void;
  onFocusChange: (value: string) => void;
  onComparisonCodesChange: (value: string) => void;
  onGenerate: () => void;
  onSave: (content: string) => void;
  onRewrite: (sectionTitle: string, instruction: string) => void;
  onRestore: (versionNumber: number) => void;
  onExport: (format: "markdown" | "docx" | "pdf") => void;
  onBackToResearch: () => void;
};

export function ReportWritingWorkspace({
  target,
  report,
  versions,
  researchResult,
  writing,
  saving,
  rewriting,
  reportType,
  focus,
  comparisonCodes,
  error,
  onReportTypeChange,
  onFocusChange,
  onComparisonCodesChange,
  onGenerate,
  onSave,
  onRewrite,
  onRestore,
  onExport,
  onBackToResearch,
}: ReportWritingWorkspaceProps) {
  const outline = REPORT_OUTLINES[reportType];
  const [activeSection, setActiveSection] = useState(0);
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState("压缩冗余表达，强化事实与判断分离，保留全部有效引用");
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setActiveSection(0);
    setDraftMarkdown(report?.markdown ?? "");
  }, [report?.id, report?.currentVersion, report?.markdown, reportType]);

  const sectionTitle = outline[activeSection] ?? outline[0]!;
  const sectionContent = extractSection(draftMarkdown, sectionTitle);
  const dirty = Boolean(report && draftMarkdown !== report.markdown);
  const generatedSections = report ? outline.filter((title) => draftMarkdown.includes(`## ${title}`)).length : 0;
  const company = target?.companyName || "研究标的";
  const sourceGroups = useMemo(() => {
    const groups = new Map<string, number>();
    for (const citation of report?.citations ?? []) groups.set(citation.sourceType, (groups.get(citation.sourceType) ?? 0) + 1);
    return [...groups.entries()].sort((left, right) => right[1] - left[1]);
  }, [report?.citations]);

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
    <header className="report-studio-command">
      <button type="button" className="report-back" onClick={onBackToResearch}><ArrowLeft />返回 AI 研究</button>
      <div className="report-title-block">
        <strong>{report?.title || `${company}${REPORT_TYPES.find((item) => item.value === reportType)?.title ?? "研究"}报告`}</strong>
        <span>{report ? `版本 V${report.currentVersion} · ${dirty ? "有未保存修改" : "已保存"} · 更新 ${formatReportDate(report.updatedAt)}` : "等待首次生成"}</span>
      </div>
      <div className="report-pipeline" aria-label="研报生成流程">
        <span className="is-done"><Check />统一数据</span><i /><span className={researchResult ? "is-done" : ""}>{researchResult ? <Check /> : 2}AI 研究</span><i /><span className="is-current">3 报告工坊</span>
      </div>
      <div className="report-command-actions">
        <button type="button" className="is-primary" onClick={onGenerate} disabled={writing}>{writing ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{writing ? "生成中" : report ? "生成新报告" : "生成研究报告"}</button>
        <button type="button" onClick={() => dirty && onSave(draftMarkdown)} disabled={!dirty || saving}>{saving ? <LoaderCircle className="animate-spin" /> : <Save />}{saving ? "保存中" : "保存版本"}</button>
        <button type="button" className={showHistory ? "is-active" : ""} onClick={() => setShowHistory((value) => !value)}><History />历史版本</button>
      </div>
    </header>

    {error ? <div className="report-studio-error"><CircleAlert />{error}</div> : null}

    <section className="report-type-matrix" aria-label="报告类型">
      {REPORT_TYPES.map((item) => <button type="button" key={item.value} className={reportType === item.value ? "is-active" : ""} onClick={() => onReportTypeChange(item.value)}><b>{item.title}</b><span>{item.detail}</span></button>)}
      <label><span>本次写作重点</span><input value={focus} onChange={(event) => onFocusChange(event.target.value)} placeholder={reportType === "event" ? "描述事件、发生时间及希望重点判断的影响" : "输入重点问题、口径和时间范围"} /></label>
      {reportType === "comparison" ? <label><span>对比公司代码</span><input value={comparisonCodes} onChange={(event) => onComparisonCodesChange(event.target.value)} placeholder="例如：300346, 002156（至少补充一个）" /></label> : null}
    </section>

    <div className="report-studio-grid">
      <aside className="report-studio-outline">
        <header><div><h2>{showHistory ? "版本历史" : "报告大纲"}</h2><span>{showHistory ? `${versions.length} 个可追溯版本` : `生成进度：${generatedSections}/${outline.length}`}</span></div><b>{showHistory ? `V${report?.currentVersion ?? 0}` : `${generatedSections}/${outline.length}`}</b></header>
        {showHistory ? <div className="report-version-list">{versions.map((version) => <button type="button" key={version.id} className={version.versionNumber === report?.currentVersion ? "is-current" : ""} onClick={() => version.versionNumber !== report?.currentVersion && onRestore(version.versionNumber)}><i>V{version.versionNumber}</i><span><b>{version.changeSummary}</b><small>{versionSourceLabel(version.source)} · {formatReportDate(version.createdAt)}</small></span>{version.versionNumber === report?.currentVersion ? <CheckCircle2 /> : <RefreshCw />}</button>)}{versions.length === 0 ? <p>生成报告后自动建立版本记录。</p> : null}</div> : <>
          <div className="report-outline-progress"><i style={{ width: `${generatedSections / outline.length * 100}%` }} /></div>
          <nav aria-label="研报章节">{outline.map((section, index) => <button type="button" key={section} className={activeSection === index ? "is-active" : ""} onClick={() => setActiveSection(index)}><i><span /><span /><span /></i><b>{String(index + 1).padStart(2, "0")}</b><strong>{section}</strong>{draftMarkdown.includes(`## ${section}`) ? <CheckCircle2 /> : <small>待生成</small>}</button>)}</nav>
        </>}
      </aside>

      <main className="report-studio-editor">
        <div className="report-rich-toolbar" role="toolbar" aria-label="Markdown 格式工具">
          <button type="button" onClick={() => wrapSelection("**")} title="加粗"><b>B</b></button>
          <button type="button" onClick={() => wrapSelection("*")} title="斜体"><i>I</i></button>
          <button type="button" onClick={() => wrapSelection("[", "](https://)")} title="链接"><Link2 /></button>
          <button type="button" onClick={() => wrapSelection("\n- ", "")} title="列表">• List</button>
          <span>Markdown 章节编辑</span>
        </div>

        <article className="report-document">
          <div className="report-document-section-head"><span>{String(activeSection + 1).padStart(2, "0")}</span><h2>{sectionTitle}</h2><div><button type="button" onClick={() => onRewrite(sectionTitle, rewriteInstruction)} disabled={!report || rewriting}>{rewriting ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{rewriting ? "改写中" : "AI 改写本节"}</button><button type="button" disabled={!report?.charts.length} title={report?.charts.length ? "下方展示来自结构化字段的图表" : "当前没有可追溯的结构化图表数据"}><BarChart3 />真实图表 {report?.charts.length ?? 0}</button></div></div>
          {report ? <>
            <label className="report-rewrite-instruction"><span>改写指令</span><input value={rewriteInstruction} onChange={(event) => setRewriteInstruction(event.target.value)} /></label>
            <textarea ref={editorRef} className="report-section-editor" value={sectionContent} onChange={(event) => updateSection(event.target.value)} aria-label={`${sectionTitle}章节正文`} />
            <div className="report-section-preview"><header>排版预览</header><MarkdownBody markdown={`## ${sectionTitle}\n\n${sectionContent}`} /></div>
            {report.charts.map((chart) => <ReportChart key={chart.id} chart={chart} />)}
          </> : <ReportEmptyDraft company={company} focus={focus} onGenerate={onGenerate} writing={writing} />}
        </article>
        <footer className="report-editor-status"><span>{dirty ? <CircleAlert /> : <CheckCircle2 />}{dirty ? "修改尚未保存为新版本" : "正文与当前版本一致"}</span><span>{report?.model || "AA Research Engine"} · 引用约束写作</span></footer>
      </main>

      <aside className="report-studio-quality">
        <section className="report-quality-sources">
          <header><h3>引用与质检</h3><span>{report?.citations.length ?? 0} 条有效引用</span></header>
          <h4>真实来源分布</h4>
          {sourceGroups.map(([label, count]) => <SourceRow key={label} label={label} count={count} />)}
          {sourceGroups.length === 0 ? <p className="report-quality-empty">当前报告没有通过校验的引用。</p> : null}
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
          {(report?.quality.issues ?? []).map((item) => <div key={item}><CircleAlert /><span><b>{item}</b><small>修正后保存会自动生成新版本并重新质检</small></span></div>)}
          {!report ? <div><CircleAlert /><span><b>尚未生成报告</b><small>先完成目标选择与证据准备</small></span></div> : null}
        </section>

        <section className="report-export-panel">
          <h4>导出与成果沉淀</h4>
          <div>
            <button type="button" disabled={!report} onClick={() => onExport("markdown")}><Download />Markdown</button>
            <button type="button" disabled={!report} onClick={() => onExport("docx")}><FileOutput />Word</button>
            <button type="button" disabled={!report} onClick={() => onExport("pdf")}><FileText />PDF</button>
          </div>
          <button type="button" className="report-publish" disabled={!report}><Send />{report ? "已自动进入成果库" : "等待报告生成"}<ChevronRight /></button>
        </section>
      </aside>
    </div>
  </div>;
}

function SourceRow({ label, count }: { label: string; count: number }) {
  return <div className="report-source-row is-industry"><span><Quote /></span><b>{label}</b><em>{count}<ChevronRight /></em></div>;
}

function ReportEmptyDraft({ company, focus, onGenerate, writing }: { company: string; focus: string; onGenerate: () => void; writing: boolean }) {
  return <div className="report-empty-draft"><FileText /><h3>{company}研究报告尚未生成</h3><p>报告只使用统一档案、产业链关系、AI 联合研判与证据目录。没有依据的数字和判断不会进入正文。</p><blockquote><b>写作重点</b>{focus || "尚未填写"}</blockquote><button type="button" onClick={onGenerate} disabled={writing}>{writing ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{writing ? "正在组织章节" : "开始生成研报"}</button></div>;
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
