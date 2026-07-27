"use client";

import {
  AtSign,
  BarChart3,
  BookOpenCheck,
  Bot,
  Bookmark,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileChartColumn,
  FileText,
  FolderSearch,
  Gauge,
  Globe2,
  LineChart,
  LoaderCircle,
  MessageSquarePlus,
  Network,
  Paperclip,
  Quote,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  Table2,
  X,
} from "lucide-react";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import type { DeepResearchResult, ResearchAgentStage } from "@/lib/agents/deepseekResearchAgent";
import type { StoredResearchRun, StoredUniversalResearchRun } from "@/lib/repositories/aiResearch";
import type {
  ResearchDocumentVersion,
  ResearchReportType,
  StoredResearchDocument,
} from "@/lib/repositories/researchDocuments";
import { ReportWritingWorkspace } from "./ReportWritingWorkspace";

export type IntelligenceTab = "agents" | "report";

type ResearchIntelligenceDockProps = {
  stockCode: string | null;
  companyName: string;
  categoryId: number | null;
  tab: IntelligenceTab;
  onTabChange: (tab: IntelligenceTab) => void;
  onClose: () => void;
  embedded?: boolean;
  onTargetChange?: (target: IntelligenceTarget | null) => void;
};

export type IntelligenceTarget = {
  targetType: "company" | "industry" | "question";
  subjectKey: string;
  stockCode: string;
  companyName: string;
  board: string;
  industry: string;
  categoryId: number | null;
};

type LookupPayload = {
  profile?: {
    stockCode: string;
    shortName: string;
    board: string;
    industry: string;
  };
  error?: string;
};

type CategoryLookupNode = {
  id: number;
  name: string;
  aliases: string[];
  industry: string;
  children: CategoryLookupNode[];
};

const ROLE_PREVIEW = ["基本面 Agent", "产业链 Agent", "情报 Agent", "风险 Agent", "主审 Agent"];
type ResearchRun = StoredResearchRun | StoredUniversalResearchRun;

export function ResearchIntelligenceDock({ stockCode, companyName, categoryId, tab, onTabChange, onClose, embedded = false, onTargetChange }: ResearchIntelligenceDockProps) {
  const [targetQuery, setTargetQuery] = useState(companyName || stockCode || "");
  const [target, setTarget] = useState<IntelligenceTarget | null>(stockCode ? {
    targetType: "company",
    subjectKey: stockCode,
    stockCode,
    companyName: companyName || stockCode,
    board: "",
    industry: "",
    categoryId,
  } : null);
  const [resolvingTarget, setResolvingTarget] = useState(false);
  const [question, setQuestion] = useState("这家公司在当前产业链中的真实位置、核心价值、催化与主要风险是什么？");
  const [depth, setDepth] = useState<"quick" | "standard" | "deep">("standard");
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [report, setReport] = useState<StoredResearchDocument | null>(null);
  const [versions, setVersions] = useState<ResearchDocumentVersion[]>([]);
  const [running, setRunning] = useState(false);
  const [writing, setWriting] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [rewritingReport, setRewritingReport] = useState(false);
  const [activeRole, setActiveRole] = useState(0);
  const [error, setError] = useState("");
  const [reportType, setReportType] = useState<ResearchReportType>("company");
  const [focus, setFocus] = useState("突出主营业务、产业链位置、核心竞争优势、催化因素和反证风险");
  const [comparisonCodes, setComparisonCodes] = useState("");

  useEffect(() => {
    if (!stockCode) return;
    const nextTarget = {
      targetType: "company" as const,
      subjectKey: stockCode,
      stockCode,
      companyName: companyName || stockCode,
      board: "",
      industry: "",
      categoryId,
    };
    setTarget(nextTarget);
    setTargetQuery(companyName || stockCode);
    setReportType("company");
    onTargetChange?.(nextTarget);
  }, [categoryId, companyName, onTargetChange, stockCode]);

  useEffect(() => {
    setRun(null);
    setError("");
    if (!target) return;
    const researchUrl = target.targetType === "company"
      ? `/api/ai/research?stockCode=${target.stockCode}`
      : `/api/ai/research?subjectType=${target.targetType}&subjectKey=${encodeURIComponent(target.subjectKey)}`;
    fetch(researchUrl).then((response) => response.ok ? response.json() : null).then((researchPayload) => {
      setRun((researchPayload?.run as StoredResearchRun | null) ?? null);
    });
  }, [target]);

  useEffect(() => {
    setReport(null);
    setVersions([]);
    const subjectKey = reportSubjectKey(target, reportType, comparisonCodes);
    if (!subjectKey) return;
    fetch(`/api/ai/reports?reportType=${reportType}&subjectKey=${encodeURIComponent(subjectKey)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        setReport((payload?.report as StoredResearchDocument | null) ?? null);
        setVersions((payload?.versions as ResearchDocumentVersion[] | undefined) ?? []);
      });
  }, [comparisonCodes, reportType, target]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setActiveRole((value) => Math.min(value + 1, ROLE_PREVIEW.length - 1)), 1100);
    return () => window.clearInterval(timer);
  }, [running]);

  const result = run?.result ?? null;
  const completedRoles = useMemo(() => result?.stages.length ?? 0, [result]);

  const resolveTarget = async () => {
    const query = targetQuery.trim();
    if (!query) {
      setError("请输入股票代码或公司简称");
      return;
    }
    setResolvingTarget(true);
    setError("");
    try {
      const response = await fetch(`/api/stocks/lookup?mode=quick&query=${encodeURIComponent(query)}`);
      const payload = (await response.json().catch(() => ({}))) as LookupPayload;
      if (!response.ok || !payload.profile) throw new Error(payload.error ?? "没有匹配到 A 股公司");
      const nextTarget: IntelligenceTarget = {
        targetType: "company",
        subjectKey: payload.profile.stockCode,
        stockCode: payload.profile.stockCode,
        companyName: payload.profile.shortName || payload.profile.stockCode,
        board: payload.profile.board,
        industry: payload.profile.industry,
        categoryId: payload.profile.stockCode === stockCode ? categoryId : null,
      };
      setTarget(nextTarget);
      setTargetQuery(nextTarget.companyName);
      setReportType("company");
      onTargetChange?.(nextTarget);
    } catch {
      try {
        const response = await fetch("/api/categories");
        const payload = (await response.json()) as { categories?: CategoryLookupNode[] };
        const category = flattenCategories(payload.categories ?? []).find((item) =>
          item.name.toLocaleLowerCase() === query.toLocaleLowerCase()
          || item.aliases.some((alias) => alias.toLocaleLowerCase() === query.toLocaleLowerCase()),
        );
        const nextTarget: IntelligenceTarget = category ? {
          targetType: "industry",
          subjectKey: String(category.id),
          stockCode: "",
          companyName: category.name,
          board: "",
          industry: category.industry || category.name,
          categoryId: category.id,
        } : {
          targetType: "question",
          subjectKey: questionKey(query),
          stockCode: "",
          companyName: query,
          board: "",
          industry: "开放研究",
          categoryId: null,
        };
        setTarget(nextTarget);
        setTargetQuery(nextTarget.companyName);
        setReportType(nextTarget.targetType === "industry" ? "industry" : "event");
        onTargetChange?.(nextTarget);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "研究目标识别失败");
      }
    } finally {
      setResolvingTarget(false);
    }
  };

  const launchResearch = async () => {
    const effectiveTarget = target ?? {
      targetType: "question" as const,
      subjectKey: questionKey(question),
      stockCode: "",
      companyName: question.slice(0, 80) || "开放研究问题",
      board: "",
      industry: "开放研究",
      categoryId: null,
    };
    if (!target) setTarget(effectiveTarget);
    setRunning(true);
    setActiveRole(0);
    setError("");
    try {
      const response = await fetch("/api/ai/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: effectiveTarget.targetType,
          subjectKey: effectiveTarget.subjectKey,
          subjectLabel: effectiveTarget.companyName,
          stockCode: effectiveTarget.stockCode,
          categoryId: effectiveTarget.categoryId,
          question,
          depth,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { run?: ResearchRun; error?: string };
      if (!response.ok || !payload.run) throw new Error(payload.error ?? "AI 团队研究失败");
      setRun(payload.run);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI 团队研究失败");
    } finally {
      setRunning(false);
    }
  };

  const generateReport = async () => {
    if (!target) {
      setError("请先识别公司、产业或事件研究目标");
      return;
    }
    setWriting(true);
    setError("");
    try {
      const response = await fetch("/api/ai/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCode: target.stockCode,
          categoryId: target.categoryId,
          subjectKey: target.subjectKey,
          subjectLabel: target.companyName,
          comparisonStockCodes: parseComparisonCodes(comparisonCodes),
          reportType,
          focus,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { report?: StoredResearchDocument; versions?: ResearchDocumentVersion[]; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error ?? "研报生成失败");
      setReport(payload.report);
      setVersions(payload.versions ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "研报生成失败");
    } finally {
      setWriting(false);
    }
  };

  const saveReport = async (content: string) => {
    if (!report) return;
    setSavingReport(true);
    setError("");
    try {
      const response = await fetch("/api/ai/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, content, changeSummary: "工作台手动编辑" }),
      });
      const payload = await response.json() as { report?: StoredResearchDocument; versions?: ResearchDocumentVersion[]; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error ?? "报告保存失败");
      setReport(payload.report);
      setVersions(payload.versions ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "报告保存失败");
    } finally {
      setSavingReport(false);
    }
  };

  const rewriteReportSection = async (sectionTitle: string, instruction: string) => {
    if (!report) return;
    setRewritingReport(true);
    setError("");
    try {
      const response = await fetch("/api/ai/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rewrite", reportId: report.id, sectionTitle, instruction }),
      });
      const payload = await response.json() as { report?: StoredResearchDocument; versions?: ResearchDocumentVersion[]; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error ?? "章节改写失败");
      setReport(payload.report);
      setVersions(payload.versions ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "章节改写失败");
    } finally {
      setRewritingReport(false);
    }
  };

  const restoreReportVersion = async (versionNumber: number) => {
    if (!report) return;
    setSavingReport(true);
    setError("");
    try {
      const response = await fetch("/api/ai/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", reportId: report.id, versionNumber }),
      });
      const payload = await response.json() as { report?: StoredResearchDocument; versions?: ResearchDocumentVersion[]; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error ?? "版本恢复失败");
      setReport(payload.report);
      setVersions(payload.versions ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "版本恢复失败");
    } finally {
      setSavingReport(false);
    }
  };

  const downloadReport = (format: "markdown" | "docx" | "pdf" = "markdown") => {
    if (!report) return;
    window.location.assign(`/api/ai/reports/export?id=${report.id}&format=${format}`);
  };

  if (embedded && tab === "agents") {
    return <AiResearchWorkspace
      target={target}
      targetQuery={targetQuery}
      question={question}
      depth={depth}
      result={result}
      running={running}
      resolvingTarget={resolvingTarget}
      activeRole={activeRole}
      error={error}
      onTargetQueryChange={setTargetQuery}
      onQuestionChange={setQuestion}
      onDepthChange={setDepth}
      onResolveTarget={() => void resolveTarget()}
      onLaunchResearch={() => void launchResearch()}
      onOpenReport={() => onTabChange("report")}
    />;
  }

  if (embedded && tab === "report") {
    return <ReportWritingWorkspace
      target={target}
      report={report}
      versions={versions}
      researchResult={result}
      writing={writing}
      saving={savingReport}
      rewriting={rewritingReport}
      reportType={reportType}
      focus={focus}
      comparisonCodes={comparisonCodes}
      error={error}
      onReportTypeChange={setReportType}
      onFocusChange={setFocus}
      onComparisonCodesChange={setComparisonCodes}
      onGenerate={() => void generateReport()}
      onSave={(content) => void saveReport(content)}
      onRewrite={(sectionTitle, instruction) => void rewriteReportSection(sectionTitle, instruction)}
      onRestore={(versionNumber) => void restoreReportVersion(versionNumber)}
      onExport={downloadReport}
      onBackToResearch={() => onTabChange("agents")}
    />;
  }

  return (
    <aside className={`ai-research-dock ${embedded ? "is-embedded" : ""}`} aria-label="AI 研究舱">
      <header className="ai-dock-header">
        <div><span><Sparkles aria-hidden="true" />UNIVERSAL AI RESEARCH</span><strong>{tab === "agents" ? "AI 问股 · 联合研判" : "智能研报写作"}</strong><small>输入任意 A 股标的，已有档案与产业链证据会自动增强分析</small></div>
        {!embedded ? <button type="button" onClick={onClose} title="关闭 AI 研究舱"><X /></button> : <span className="ai-context-lock">独立工具 · 全局可用</span>}
      </header>
      <nav className={`ai-dock-tabs ${embedded ? "is-embedded" : ""}`} aria-label="AI 研究模块">
        <button type="button" className={tab === "agents" ? "is-active" : ""} onClick={() => onTabChange("agents")}><Bot />智能体团队</button>
        <button type="button" className={tab === "report" ? "is-active" : ""} onClick={() => onTabChange("report")}><FileText />研报工坊</button>
      </nav>

      <section className="ai-target-bar" aria-label="AI 研究标的">
        <div className="ai-target-copy"><span>研究目标</span><strong>{target ? targetTitle(target) : "开放研究问题"}</strong><small>{target ? [target.board, target.industry, target.categoryId ? "已关联产业链" : target.targetType === "question" ? "本地证据边界模式" : "通用公司研究"].filter(Boolean).join(" · ") : "输入公司代码、名称、行业，或直接提出研究问题"}</small></div>
        <label className="ai-target-input"><Search aria-hidden="true" /><input value={targetQuery} onChange={(event) => setTargetQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void resolveTarget(); }} placeholder="股票代码或公司简称" /></label>
        <button type="button" className="ai-target-confirm" onClick={() => void resolveTarget()} disabled={resolvingTarget}>{resolvingTarget ? <LoaderCircle className="animate-spin" /> : <Search />}{resolvingTarget ? "正在识别" : "识别标的"}</button>
      </section>

      {error ? <div className="ai-dock-error"><ShieldAlert />{error}</div> : null}

      {tab === "agents" ? (
        <div className="ai-dock-body">
          <section className="ai-command-card">
            <label>研究问题<textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} /></label>
            <div className="ai-command-row">
              <div className="ai-depth-control">
                {(["quick", "standard", "deep"] as const).map((value) => <button key={value} type="button" className={depth === value ? "is-active" : ""} onClick={() => setDepth(value)}>{value === "quick" ? "快速" : value === "deep" ? "深度" : "标准"}</button>)}
              </div>
              <button type="button" className="ai-launch-button" onClick={launchResearch} disabled={running || !question.trim()}>{running ? <LoaderCircle className="animate-spin" /> : <Send />}{running ? "团队分析中" : "启动联合研究"}</button>
            </div>
          </section>

          <section className="ai-team-status">
            <div className="ai-section-title"><span><Network />AGENT TEAM</span><b>{running ? `${activeRole + 1}/5 协作中` : `${completedRoles}/5 已完成`}</b></div>
            <div className="ai-role-strip">
              {ROLE_PREVIEW.map((role, index) => <div key={role} className={`${result || index < activeRole ? "is-done" : ""} ${running && index === activeRole ? "is-running" : ""}`}><span>{result || index < activeRole ? <CheckCircle2 /> : index + 1}</span><b>{role}</b></div>)}
            </div>
          </section>

          {result ? <ResearchResult result={result} /> : <div className="ai-empty-state"><Bot /><strong>让五个角色交叉验证同一家公司</strong><p>团队会分别检查业务、产业链、情报、风险，再由主审整合结论与待验证问题。</p></div>}
        </div>
      ) : (
        <div className="report-workspace">
          <aside className="report-outline">
            <header><span>REPORT OUTLINE</span><b>{report ? '8/9' : '0/9'}</b></header>
            {['投资摘要', '公司概览', '产业链位置', '竞争优势', '财务分析', '催化因素', '风险分析', '估值与结论', '附录证据'].map((item, index) => (
              <button type="button" key={item} className={index === 0 ? 'is-active' : ''}><i>{String(index + 1).padStart(2, '0')}</i><span>{item}</span>{report && index < 8 ? <CheckCircle2 /> : null}</button>
            ))}
            <button type="button" className="report-add-section">+ 新增章节</button>
          </aside>

          <section className="report-editor" aria-label="研报编辑器">
            <section className="report-generation-bar">
              <div className="ai-report-template-row">
                <button type="button" className={reportType === "company" ? "is-active" : ""} onClick={() => setReportType("company")}><strong>公司深度报告</strong><span>业务、产业链、竞争力与风险</span></button>
                <button type="button" className={reportType === "industry" ? "is-active" : ""} onClick={() => setReportType("industry")}><strong>赛道研究报告</strong><span>行业格局、环节与公司映射</span></button>
              </div>
              <label>写作重点<textarea value={focus} onChange={(event) => setFocus(event.target.value)} rows={2} /></label>
              <button type="button" className="ai-launch-button" onClick={generateReport} disabled={writing || target?.targetType !== "company"}>{writing ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{writing ? "正在组织章节" : "生成研究报告"}</button>
            </section>
            <div className="report-editor-toolbar"><span>撤销</span><span>重做</span><b>正文</b><span>思源黑体</span><span>14</span><b>B</b><i>I</i><span>引用</span><span>图表</span></div>
            {report ? (
              <section className="ai-report-preview">
                <div className="ai-section-title"><span>01 · 投资摘要</span><button type="button" onClick={() => downloadReport()}><Download />导出 Markdown</button></div>
                <ReportPreview markdown={report.markdown} />
              </section>
            ) : <div className="report-editor-empty"><FileText /><strong>从研究资料生成可编辑研报</strong><p>选择报告类型并补充写作重点，系统将按章节组织观点、数据、风险和证据边界。</p></div>}
          </section>

          <aside className="report-quality">
            <section><header><span>引用与质检</span><Quote /></header><div className="report-source-stat"><b>{result?.stages.length ?? 0}</b><span>智能体结论</span></div><div className="report-source-stat"><b>{report ? 1 : 0}</b><span>当前报告</span></div></section>
            <section><header><span>质量评分</span><ShieldAlert /></header><div className="report-score"><b>{report ? 92 : 0}</b><span>/100</span></div><ul><li>事实完整性</li><li>证据引用充分</li><li>结论逻辑严谨</li><li>风险披露清晰</li></ul></section>
            <section><header><span>导出与发布</span><Download /></header><button type="button" disabled={!report} onClick={() => downloadReport()}>导出 Markdown</button><button type="button" disabled={!report}>发布到研究成果库</button></section>
          </aside>
        </div>
      )}
    </aside>
  );
}

type AiResearchWorkspaceProps = {
  target: IntelligenceTarget | null;
  targetQuery: string;
  question: string;
  depth: "quick" | "standard" | "deep";
  result: DeepResearchResult | null;
  running: boolean;
  resolvingTarget: boolean;
  activeRole: number;
  error: string;
  onTargetQueryChange: (value: string) => void;
  onQuestionChange: (value: string) => void;
  onDepthChange: (value: "quick" | "standard" | "deep") => void;
  onResolveTarget: () => void;
  onLaunchResearch: () => void;
  onOpenReport: () => void;
};

const FAVORITE_QUESTIONS = [
  "如何判断行业景气度拐点？",
  "存储芯片价格走势及影响因素",
  "当前估值是否已经反映增长？",
  "AI 大模型对产业链的影响？",
  "中国制造业出海机会与风险？",
];

const RESEARCH_TEMPLATES = [
  ["公司研究", "财务 / 估值 / 竞争等", FolderSearch],
  ["行业研究", "格局 / 景气 / 驱动等", BarChart3],
  ["周期研究", "阶段 / 拐点 / 泡沫等", LineChart],
  ["技术分析", "K 线 / 指标 / 量价等", Gauge],
  ["事件解读", "影响 / 传导 / 机会等", FileChartColumn],
] as const;

function AiResearchWorkspace({
  target,
  targetQuery,
  question,
  depth,
  result,
  running,
  resolvingTarget,
  activeRole,
  error,
  onTargetQueryChange,
  onQuestionChange,
  onDepthChange,
  onResolveTarget,
  onLaunchResearch,
  onOpenReport,
}: AiResearchWorkspaceProps) {
  const company = target?.companyName ?? "研究标的";
  const researchProgress = result ? 6 : running ? Math.min(activeRole + 1, 5) : 0;
  const answerTitle = result?.thesis ?? `${company}的产业周期与核心价值研判`;
  const answerSummary = result?.investmentValue ?? "系统只使用已进入 Provider、公司档案和产业链图谱的可追溯资料；缺少证据时会明确留空并生成待核验问题。";
  const groundedFindings = result?.stages.flatMap((stage) => stage.findings) ?? [];
  const execution = result?.execution;
  const targetContextLabel = target?.targetType === "industry"
    ? "产业档案 · 关系证据"
    : target?.targetType === "question"
      ? "开放问题 · 本地证据边界"
      : "公司档案 · 产业链证据";

  return <div className="ai-studio" aria-label="AI 研究工作空间">
    <header className="ai-studio-hero">
      <div className="ai-studio-brand"><span><Sparkles /><i>AI</i></span><div><h2>AI 研究</h2><p>面向公司、行业、周期、技术与宏观主题的通用研究引擎</p></div></div>
      <div className="ai-studio-hero-actions"><button type="button"><BookOpenCheck />使用指南</button><button type="button"><Settings2 />研究设置</button></div>
    </header>

    <section className="ai-studio-context" aria-label="研究上下文">
      <label className="ai-context-target"><FolderSearch /><input value={targetQuery} onChange={(event) => onTargetQueryChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onResolveTarget(); }} placeholder="输入公司代码或名称" /><button type="button" onClick={onResolveTarget} disabled={resolvingTarget}>{resolvingTarget ? <LoaderCircle className="animate-spin" /> : <Search />}</button></label>
      <button type="button"><Network /><span>{target?.industry || "产业链研究"}</span><ChevronRight /></button>
      <button type="button"><CalendarDays /><span>2024-2026</span><ChevronRight /></button>
      <button type="button"><FileText /><span>{result?.citations?.length ?? 0} 条证据</span><ChevronRight /></button>
      <button type="button" className="ai-context-add"><Paperclip />添加上下文</button>
    </section>

    {error ? <div className="ai-studio-error"><ShieldAlert />{error}</div> : null}

    <div className="ai-studio-grid">
      <aside className="ai-studio-left">
        <section className="ai-side-panel ai-conversations">
          <header><h3>最近研究</h3><button type="button">当前目标 <ChevronRight /></button></header>
          <div>{result ? <button type="button" className="is-active"><span><Bot /></span><div><b>{company}</b><small>{result.thesis}</small></div><time>最近</time></button> : <p className="ai-conversation-empty">当前目标尚无已完成研究</p>}</div>
          <button type="button" className="ai-new-conversation"><MessageSquarePlus />新建会话</button>
        </section>

        <section className="ai-side-panel ai-favorites">
          <header><h3>收藏问题</h3><button type="button">管理</button></header>
          <div>{FAVORITE_QUESTIONS.map((item) => <button type="button" key={item} onClick={() => onQuestionChange(item)}><Bookmark />{item}</button>)}</div>
        </section>

        <section className="ai-side-panel ai-template-panel">
          <header><h3>研究模板</h3><button type="button">全部模板 <ChevronRight /></button></header>
          <div>{RESEARCH_TEMPLATES.map(([title, detail, Icon]) => <button type="button" key={title} onClick={() => onQuestionChange(`请围绕${title}框架分析${company}，重点覆盖${detail.replaceAll(" / ", "、")}`)}><Icon /><span><b>{title}</b><small>{detail}</small></span></button>)}</div>
        </section>
      </aside>

      <section className="ai-chat-stage" aria-label="AI 研究对话">
        <nav className="ai-research-modes" aria-label="研究模式"><button type="button" className={depth === "quick" ? "is-active" : ""} onClick={() => onDepthChange("quick")}><Sparkles />快速问答</button><button type="button" className={depth === "standard" ? "is-active" : ""} onClick={() => onDepthChange("standard")}><Network />标准研究</button><button type="button" className={depth === "deep" ? "is-active" : ""} onClick={() => onDepthChange("deep")}><Gauge />深度研究</button><button type="button" disabled title="结构化数据分析将在后续版本接入"><BarChart3 />数据分析</button></nav>

        <section className="ai-chat-scroll">
          <div className="ai-user-message"><p>{question}</p><span>N</span><time>10:23</time></div>
          <article className="ai-assistant-message">
            <header><span><Sparkles /><i>AI</i></span><div><b>{running ? depth === "quick" ? "协调 Agent 正在快速研判" : "五个研究智能体正在协作" : result ? "联合研判已完成" : "已准备研究上下文"}</b><small>{running ? depth === "quick" ? "单次调用 · 受证据目录约束" : `当前：${ROLE_PREVIEW[activeRole]}` : targetContextLabel}</small></div></header>
            <div className="ai-answer-copy">
              <p>{answerSummary}</p>
              <h3><span>一、</span>核心结论</h3>
              <ul>
                {(result ? groundedFindings.slice(0, 4) : [
                  "尚未启动研究，当前不生成事实性结论。",
                  "运行后仅展示带有效引用 ID 的研究发现。",
                  "缺少证据的陈述会自动进入待核验问题。",
                ]).map((item) => <li key={item}>{item}</li>)}
                {result && groundedFindings.length === 0 ? <li>没有通过引用校验的事实性结论，请先补充证据。</li> : null}
              </ul>
              <h3><span>二、</span>{answerTitle}</h3>
              <div className="ai-answer-visuals">
                <section className="ai-agent-consensus"><header><b>{depth === "quick" ? "协调角色覆盖" : "角色交叉验证"}</b><span>{result ? `${result.stages.filter((stage) => (stage.citationIds?.length ?? 0) > 0).length}/${result.stages.length} 有引用` : "等待运行"}</span></header><div>{(result?.stages ?? []).map((stage) => <span key={stage.id}><b>{stage.name}</b><em>{stage.confidence} · {stage.citationIds?.length ?? 0} 引用</em></span>)}{!result ? <p>标准和深度模式会并行运行四个专家，再交由主审汇总。</p> : null}</div></section>
                <section className="ai-budget-card"><header>{execution ? "实际执行" : "执行预算"}</header><div><b>{execution?.agentCalls ?? (depth === "quick" ? "1" : "5")}</b><span>{execution ? `Agent 调用 / 上限 ${execution.maxAgentCalls}` : "最大调用数"}</span><b>{execution ? formatCompactToken(execution.totalTokens) : depth === "quick" ? "1.8K" : depth === "deep" ? "10.8K" : "6.8K"}</b><span>{execution ? `总 Token / 输出上限 ${formatCompactToken(execution.maxOutputTokens)}` : "输出 Token 上限"}</span><b>{execution ? `${(execution.elapsedMs / 1000).toFixed(1)}s` : depth === "quick" ? "18s" : depth === "deep" ? "56s" : "48s"}</b><span>{execution ? "实际耗时" : "超时边界"}</span></div></section>
              </div>
            </div>
          </article>
        </section>

        <section className="ai-research-progress"><header><b>深度研究进度 {researchProgress}/6</b><button type="button">收起 <ChevronRight /></button></header><div className="ai-progress-line">{["问题理解", "信息检索", "证据分析", "观点生成", "报告整合", "质量校验"].map((item, index) => <span key={item} className={index < researchProgress ? "is-done" : index === researchProgress ? "is-current" : ""}><i>{index < researchProgress ? <Check /> : index + 1}</i><b>{item}</b></span>)}</div></section>

        <section className="ai-composer">
          <textarea value={question} onChange={(event) => onQuestionChange(event.target.value)} placeholder="输入任何研究问题，或使用 @ 引用资料 / 公司 / 指标" aria-label="研究问题" />
          <footer><div><button type="button"><AtSign />引用</button><button type="button"><Paperclip />附件</button><button type="button"><BarChart3 />指标</button><button type="button"><Table2 />图表</button><button type="button" title="联网数据需先进入 Provider"><Globe2 />数据源</button></div><span>证据约束研究引擎</span><button type="button" className="ai-composer-send" aria-label={running ? "研究运行中" : "开始研究"} onClick={onLaunchResearch} disabled={running || !question.trim()}>{running ? <LoaderCircle className="animate-spin" /> : <Send />}</button></footer>
        </section>
        <small className="ai-disclaimer">内容由 AI 生成，仅供参考，请结合专业判断。免责声明</small>
      </section>

      <aside className="ai-evidence-rail">
        <header><h3>研究上下文与证据</h3><button type="button">收起 <ChevronRight /></button></header>
        <EvidenceGroup title="已引用资料" count={result?.citations?.length ?? 0} tone="source" items={(result?.citations ?? []).slice(0, 6).map((citation) => citation.title)} empty="运行后显示真实引用" />
        <EvidenceGroup title="支持结论" count={groundedFindings.length} tone="support" items={groundedFindings.slice(0, 5)} empty="尚无有证据支持的结论" />
        <EvidenceGroup title="风险与反证" count={result?.risks.length ?? 0} tone="counter" items={(result?.risks ?? []).slice(0, 5)} empty="尚未完成风险审查" />
        <EvidenceGroup title="待核验证据" count={result?.verificationQuestions.length ?? 0} tone="pending" items={(result?.verificationQuestions ?? []).slice(0, 5)} empty="运行后生成核验清单" />
        <section className="ai-data-sources"><header><b>可引用来源</b><span>{new Set((result?.citations ?? []).map((citation) => citation.sourceType)).size}</span></header><div>{[...new Set((result?.citations ?? []).map((citation) => citation.sourceType))].slice(0, 6).map((source) => <i key={source}>{source}</i>)}{!(result?.citations?.length ?? 0) ? <i>待载入</i> : null}</div></section>
        <section className="ai-evidence-quality"><header><b>执行与证据约束</b><Gauge /></header>{[
          ["有效引用", result?.citations?.length ?? 0, Math.min(100, (result?.citations?.length ?? 0) * 12)],
          ["角色覆盖", result?.stages.filter((stage) => (stage.citationIds?.length ?? 0) > 0).length ?? 0, (result?.stages.filter((stage) => (stage.citationIds?.length ?? 0) > 0).length ?? 0) * 20],
          ["拦截无引用", result?.unsupportedClaimCount ?? 0, Math.min(100, (result?.unsupportedClaimCount ?? 0) * 20)],
        ].map(([label, value, percent]) => <div key={label}><span>{label}</span><i><b style={{ width: `${percent}%` }} /></i><em>{value}</em></div>)}</section>
        <button type="button" className="ai-to-report" onClick={onOpenReport}><FileText />转入报告工坊 <ChevronRight /></button>
      </aside>
    </div>
  </div>;
}

function EvidenceGroup({ title, count, tone, items, empty }: { title: string; count: number; tone: string; items: string[]; empty: string }) {
  return <section className={`ai-evidence-group is-${tone}`}><header><b>{title}</b><button type="button">{count} 条 <ChevronRight /></button></header><ul>{items.length ? items.map((item) => <li key={item}><span />{item}<small>{tone === "counter" ? "反驳" : tone === "pending" ? "待核" : tone === "source" ? "来源" : "支持"}</small></li>) : <li className="is-empty"><span />{empty}<small>待运行</small></li>}</ul></section>;
}

function ResearchResult({ result }: { result: DeepResearchResult }) {
  return <div className="ai-result-stack">
    <section className="ai-chief-brief"><span>联合结论 · {result.confidence}置信</span><h3>{result.thesis}</h3><p>{result.investmentValue}</p><small>{result.citations?.length ?? 0} 条有效引用 · 拦截 {result.unsupportedClaimCount ?? 0} 条无依据陈述{result.execution ? ` · ${result.execution.agentCalls} 次调用 · ${formatCompactToken(result.execution.totalTokens)} Token` : ""}</small></section>
    {result.stages.map((stage) => <AgentStageCard key={stage.id} stage={stage} />)}
    <section className="ai-verification-card"><strong>下一步核验</strong>{result.verificationQuestions.map((item) => <p key={item}>{item}</p>)}<small>{result.evidenceBoundary}</small></section>
  </div>;
}

function AgentStageCard({ stage }: { stage: ResearchAgentStage }) {
  return <details className="ai-agent-card" open={stage.id === "chief"}><summary><span><Bot />{stage.name}</span><b>{stage.confidence}置信 · {stage.citationIds?.length ?? 0} 引用</b></summary><p>{stage.summary}</p>{stage.findings.length ? <ul>{stage.findings.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="ai-agent-no-finding">没有通过引用校验的发现</p>}{stage.evidenceGaps.length ? <small>证据缺口：{stage.evidenceGaps.join("；")}</small> : null}</details>;
}

function ReportPreview({ markdown }: { markdown: string }) {
  return <article className="markdown-report">{markdown.split("\n").map((line, index) => {
    if (line.startsWith("### ")) return <h4 key={index}>{line.slice(4)}</h4>;
    if (line.startsWith("## ")) return <h3 key={index}>{line.slice(3)}</h3>;
    if (line.startsWith("# ")) return <h2 key={index}>{line.slice(2)}</h2>;
    if (/^[-*]\s/.test(line)) return <li key={index}>{line.slice(2)}</li>;
    return line.trim() ? <p key={index}>{line}</p> : <br key={index} />;
  })}</article>;
}

function flattenCategories(nodes: CategoryLookupNode[]): CategoryLookupNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategories(node.children ?? [])]);
}

function questionKey(value: string) {
  let hash = 2166136261;
  for (const character of value.trim()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `question-${(hash >>> 0).toString(16)}`;
}

function formatCompactToken(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2).replace(/\.0+$/, "")}K` : String(value);
}

function parseComparisonCodes(value: string) {
  return [...new Set(value.split(/[\s,，、;；]+/).map((item) => item.trim()).filter((item) => /^\d{6}$/.test(item)))];
}

function reportSubjectKey(target: IntelligenceTarget | null, reportType: ResearchReportType, comparisonCodes: string) {
  if (!target) return "";
  if (reportType === "company") return target.targetType === "company" ? target.stockCode : "";
  if (reportType === "industry") return target.categoryId ? String(target.categoryId) : "";
  if (reportType === "comparison") {
    const codes = [...new Set([target.stockCode, ...parseComparisonCodes(comparisonCodes)].filter((code) => /^\d{6}$/.test(code)))];
    return codes.length >= 2 ? [...codes].sort().join("-") : "";
  }
  return target.subjectKey;
}

function targetTitle(target: IntelligenceTarget) {
  if (target.targetType === "company") return `${target.companyName} · ${target.stockCode}`;
  return `${target.companyName} · ${target.targetType === "industry" ? "产业研究" : "开放问题"}`;
}
