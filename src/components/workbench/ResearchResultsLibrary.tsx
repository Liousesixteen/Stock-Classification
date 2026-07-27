"use client";

import {
  Archive,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Download,
  FileBarChart2,
  FileText,
  Filter,
  Grid2X2,
  Layers3,
  List,
  Orbit,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
  ResearchArtifact,
  ResearchArtifactKind,
  ResearchArtifactStage,
  ResearchResultsLibrary as ResearchResultsLibraryData,
} from "@/lib/repositories/researchResults";
import { ResizablePanelControls, useResizablePanelLayout } from "./ResizablePanelControls";
import { WorkspaceState } from "./WorkspaceState";

type ResultsFilter = "all" | ResearchArtifactKind | "draft";
type ResultsView = "grid" | "list";

const kindMeta: Record<ResearchArtifactKind, { label: string; icon: typeof FileText; tone: string }> = {
  report: { label: "深度报告", icon: FileText, tone: "blue" },
  ai: { label: "AI研究", icon: Bot, tone: "violet" },
  snapshot: { label: "图谱快照", icon: Orbit, tone: "cyan" },
  comparison: { label: "对比研究", icon: BarChart3, tone: "orange" },
};

const stageMeta: Record<ResearchArtifactStage, { label: string; tone: string }> = {
  ready: { label: "可归档", tone: "ready" },
  draft: { label: "草稿", tone: "draft" },
  needs_work: { label: "待完善", tone: "pending" },
};
const resultsLeftPanel = { defaultWidth: 220, minWidth: 176, maxWidth: 310 };
const resultsRightPanel = { defaultWidth: 236, minWidth: 200, maxWidth: 340 };

export function ResearchResultsLibrary({
  refreshKey,
  onOpenCompany,
  onOpenAtlas,
  onCreate,
}: {
  refreshKey: number;
  onOpenCompany: (stockCode: string, categoryId: number | null) => void;
  onOpenAtlas: (categoryId: number | null) => void;
  onCreate: () => void;
}) {
  const [data, setData] = useState<ResearchResultsLibraryData | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResultsFilter>("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"recent" | "complete">("recent");
  const [view, setView] = useState<ResultsView>("grid");
  const [preview, setPreview] = useState<ResearchArtifact | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const panels = useResizablePanelLayout("stock-classification:results-panels", resultsLeftPanel, resultsRightPanel);

  useEffect(() => {
    let active = true;
    setLoadStatus("loading");
    fetch(`/api/research-results?retry=${reloadKey}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<ResearchResultsLibraryData> : Promise.reject(new Error("results unavailable")))
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setLoadStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setData((current) => current ?? { artifacts: [], stats: { total: 0, weekAdded: 0, reportCount: 0, needsWork: 0, byKind: { report: 0, ai: 0, snapshot: 0, comparison: 0 } } });
        setLoadStatus("error");
      });
    return () => { active = false; };
  }, [refreshKey, reloadKey]);

  const categories = useMemo(() => Array.from(new Set((data?.artifacts ?? []).map((artifact) => artifact.categoryName).filter(Boolean))).sort(), [data]);
  const artifacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.artifacts ?? [])
      .filter((artifact) => !artifact.archived)
      .filter((artifact) => {
        if (filter === "all") return true;
        if (filter === "draft") return artifact.stage !== "ready";
        return artifact.kind === filter;
      })
      .filter((artifact) => category === "all" || artifact.categoryName === category)
      .filter((artifact) => !normalized || [artifact.title, artifact.summary, artifact.companyName, artifact.stockCode, artifact.categoryName, ...artifact.tags].join(" ").toLowerCase().includes(normalized))
      .sort((left, right) => sort === "complete" ? right.completeness - left.completeness : Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }, [category, data, filter, query, sort]);

  const archiveCandidates = useMemo(() => (data?.artifacts ?? []).filter((artifact) => artifact.stage === "ready" && !artifact.archived).slice(0, 3), [data]);
  const recent = (data?.artifacts ?? []).filter((artifact) => !artifact.archived).slice(0, 5);

  const archive = async (artifact: ResearchArtifact) => {
    setArchiveError("");
    const response = await fetch("/api/research-results", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifactId: artifact.id, archived: true }),
    });
    const payload = await response.json() as { artifact?: ResearchArtifact; error?: string };
    if (!response.ok || !payload.artifact) {
      setArchiveError(payload.error || "成果归档失败");
      return;
    }
    setData((current) => current ? {
      ...current,
      artifacts: current.artifacts.map((item) => item.id === artifact.id ? payload.artifact! : item),
    } : current);
    if (preview?.id === artifact.id) setPreview(null);
  };

  const exportArtifact = (artifact: ResearchArtifact) => {
    const blob = new Blob([artifact.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${artifact.title.replace(/[\\/:*?"<>|]/g, "-")}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <section
    className={`results-library ${panels.layout.leftCollapsed ? "is-left-panel-collapsed" : ""} ${panels.layout.rightCollapsed ? "is-right-panel-collapsed" : ""}`}
    data-testid="research-results-library"
    style={panels.style}
  >
    <header className="results-hero">
      <div>
        <span><BookOpenCheck aria-hidden="true" />RESEARCH OUTPUTS</span>
        <h2>成果库</h2>
        <p>统一管理研报、AI 研究结论、图谱快照与同赛道对比成果</p>
      </div>
      <div className="results-hero-metrics">
        <Metric label="成果总数" value={data?.stats.total ?? 0} hint="结构化沉淀" />
        <Metric label="本周新增" value={data?.stats.weekAdded ?? 0} hint="持续更新" />
        <Metric label="深度报告" value={data?.stats.reportCount ?? 0} hint="可导出研报" />
        <Metric label="待完善成果" value={data?.stats.needsWork ?? 0} hint="证据或字段待补" />
      </div>
      <div className="results-hero-orbit" aria-hidden="true"><i /><i /><i /></div>
    </header>

    <div className="results-layout">
      <ResizablePanelControls layout={panels.layout} onResize={panels.resize} onResizeByKeyboard={panels.resizeByKeyboard} onToggle={panels.toggle} />
      <aside className="results-filter-rail">
        <label className="results-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、摘要、公司、标签" /></label>
        <div className="results-filter-title"><span><Filter aria-hidden="true" />筛选条件</span><button type="button" onClick={() => { setFilter("all"); setCategory("all"); setQuery(""); }}>清空</button></div>
        <FilterGroup title="成果类型" icon={Layers3}>
          <FilterButton label="全部成果" count={data?.stats.total ?? 0} active={filter === "all"} onClick={() => setFilter("all")} />
          {(Object.keys(kindMeta) as ResearchArtifactKind[]).map((kind) => <FilterButton key={kind} label={kindMeta[kind].label} count={data?.stats.byKind[kind] ?? 0} active={filter === kind} onClick={() => setFilter(kind)} />)}
        </FilterGroup>
        <FilterGroup title="行业 / 赛道" icon={Orbit}>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="按行业或赛道筛选"><option value="all">全部行业与赛道</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </FilterGroup>
        <FilterGroup title="成果状态" icon={CircleDashed}>
          <FilterButton label="全部状态" count={data?.stats.total ?? 0} active={filter !== "draft"} onClick={() => setFilter("all")} />
          <FilterButton label="草稿与待完善" count={data?.stats.needsWork ?? 0} active={filter === "draft"} onClick={() => setFilter("draft")} />
        </FilterGroup>
        <FilterGroup title="创建时间" icon={CalendarDays}>
          <div className="results-date-hint"><span>起始日期</span><i /> <span>结束日期</span></div>
        </FilterGroup>
      </aside>

      <main className="results-main">
        <div className="results-toolbar">
          <nav aria-label="成果类型快速筛选">
            <button className={filter === "all" ? "is-active" : ""} type="button" onClick={() => setFilter("all")}>全部</button>
            {(Object.keys(kindMeta) as ResearchArtifactKind[]).map((kind) => <button className={filter === kind ? "is-active" : ""} type="button" key={kind} onClick={() => setFilter(kind)}>{kindMeta[kind].label}</button>)}
            <button className={filter === "draft" ? "is-active" : ""} type="button" onClick={() => setFilter("draft")}>草稿</button>
          </nav>
          <div>
            <label><SlidersHorizontal aria-hidden="true" /><select value={sort} onChange={(event) => setSort(event.target.value as "recent" | "complete")} aria-label="成果排序"><option value="recent">更新时间</option><option value="complete">完整度</option></select></label>
            <div className="results-view-switch"><button type="button" title="卡片视图" className={view === "grid" ? "is-active" : ""} onClick={() => setView("grid")}><Grid2X2 aria-hidden="true" /></button><button type="button" title="列表视图" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}><List aria-hidden="true" /></button></div>
            <button className="results-create" type="button" onClick={onCreate}><Plus aria-hidden="true" />新建成果<ChevronDown aria-hidden="true" /></button>
          </div>
        </div>

        <div className={`results-grid is-${view}`}>
          {loadStatus === "loading" && !data ? <WorkspaceState compact state="loading" title="正在汇总研究成果" description="聚合研报、AI 结论、图谱快照与公司对比" /> : null}
          {loadStatus === "error" ? <WorkspaceState compact state="error" title="成果库加载失败" description="归档状态仍保存在本地数据库中。" onAction={() => setReloadKey((value) => value + 1)} /> : null}
          {loadStatus === "ready" && data && artifacts.length === 0 ? <WorkspaceState compact state="empty" title="当前筛选下暂无成果" description="可从 AI 研究或研报写作继续创建。" icon={<FileText aria-hidden="true" />} /> : null}
          {artifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} view={view} onPreview={() => setPreview(artifact)} onExport={() => exportArtifact(artifact)} onContinue={() => artifact.stockCode ? onOpenCompany(artifact.stockCode, artifact.categoryId) : onOpenAtlas(artifact.categoryId)} />)}
        </div>
        {artifacts.length ? <footer className="results-pagination"><button type="button" disabled><ChevronLeft aria-hidden="true" /></button><b>1</b><span>共 {artifacts.length} 项</span><em>每页 12 条</em></footer> : null}
      </main>

      <aside className="results-insights">
        <section className="results-stat-card">
          <header><h3>成果统计</h3><button type="button">查看全部 <ChevronRight /></button></header>
          <div className="results-donut" style={{ background: buildDonutGradient(data) } as CSSProperties}><div><b>{data?.stats.total ?? 0}</b><span>总数</span></div></div>
          <ul>{(Object.keys(kindMeta) as ResearchArtifactKind[]).map((kind) => <li key={kind}><i className={`is-${kindMeta[kind].tone}`} /><span>{kindMeta[kind].label}</span><b>{data?.stats.byKind[kind] ?? 0}</b></li>)}</ul>
        </section>
        <section className="results-side-list">
          <header><h3>最近打开</h3><button type="button">全部 <ChevronRight /></button></header>
          {recent.map((artifact) => <button type="button" key={artifact.id} onClick={() => setPreview(artifact)}><KindIcon kind={artifact.kind} /><span><b>{artifact.title}</b><small>{formatDate(artifact.updatedAt)}</small></span><ChevronRight aria-hidden="true" /></button>)}
        </section>
        <section className="results-side-list is-archive">
          <header><h3>推荐归档</h3><button type="button">全部 <ChevronRight /></button></header>
          {archiveError ? <p role="alert"><CircleDashed aria-hidden="true" />{archiveError}</p> : null}
          {archiveCandidates.length ? archiveCandidates.map((artifact) => <div key={artifact.id}><FileText aria-hidden="true" /><span><b>{artifact.title}</b><small>完整度 {artifact.completeness}%</small></span><button type="button" onClick={() => void archive(artifact)}>归档</button></div>) : <p><Check aria-hidden="true" />当前没有待归档成果</p>}
        </section>
      </aside>
    </div>

    {preview ? <div className="results-preview-shell" role="presentation">
      <button className="results-preview-backdrop" type="button" aria-label="关闭成果预览" onClick={() => setPreview(null)} />
      <aside className="results-preview" role="dialog" aria-modal="true" aria-label={`${preview.title}预览`}>
        <header><KindBadge artifact={preview} /><button type="button" title="关闭" onClick={() => setPreview(null)}><X aria-hidden="true" /></button></header>
        <h2>{preview.title}</h2>
        <p>{preview.summary}</p>
        <div className="results-preview-meta"><span>{preview.companyName || preview.categoryName}</span><span>{preview.stockCode || "产业链成果"}</span><span>完整度 {preview.completeness}%</span><span>{formatDate(preview.updatedAt)}</span></div>
        <article>{preview.content}</article>
        <footer><button type="button" onClick={() => exportArtifact(preview)}><Download aria-hidden="true" />导出 Markdown</button><button type="button" onClick={() => void archive(preview)}><Archive aria-hidden="true" />归档成果</button><button className="is-primary" type="button" onClick={() => preview.stockCode ? onOpenCompany(preview.stockCode, preview.categoryId) : onOpenAtlas(preview.categoryId)}>继续研究<ArrowRight aria-hidden="true" /></button></footer>
      </aside>
    </div> : null}
  </section>;
}

function Metric({ label, value, hint }: { label: string; value: number; hint: string }) {
  return <div><span>{label}</span><b>{value.toLocaleString("zh-CN")}</b><small>{hint}</small></div>;
}

function FilterGroup({ title, icon: Icon, children }: { title: string; icon: typeof Filter; children: ReactNode }) {
  return <section className="results-filter-group"><header><span><Icon aria-hidden="true" />{title}</span><ChevronDown aria-hidden="true" /></header><div>{children}</div></section>;
}

function FilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return <button type="button" className={active ? "is-active" : ""} onClick={onClick}><i>{active ? <Check aria-hidden="true" /> : null}</i><span>{label}</span><b>{count}</b></button>;
}

function ArtifactCard({ artifact, view, onPreview, onExport, onContinue }: { artifact: ResearchArtifact; view: ResultsView; onPreview: () => void; onExport: () => void; onContinue: () => void }) {
  return <article className={`result-card is-${view}`}>
    <header><KindBadge artifact={artifact} /><span className={`result-stage is-${stageMeta[artifact.stage].tone}`}>{stageMeta[artifact.stage].label}</span></header>
    <h3>{artifact.title}</h3>
    <p>{artifact.summary}</p>
    <div className="result-tags">{artifact.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
    <div className="result-meta"><span><FileBarChart2 aria-hidden="true" />{artifact.companyName || artifact.categoryName}</span><span>{artifact.model}</span><span>{artifact.version}</span><span>{formatDate(artifact.updatedAt)}</span></div>
    <div className="result-completeness"><span>完整度 {artifact.completeness}%</span><i><b style={{ width: `${artifact.completeness}%` }} /></i><em>{artifact.evidenceCount} 条证据</em></div>
    <footer><button type="button" onClick={onPreview}><BookOpenCheck aria-hidden="true" />预览</button><button type="button" onClick={onExport}><Download aria-hidden="true" />导出</button><button className="is-primary" type="button" onClick={onContinue}>继续研究<ArrowRight aria-hidden="true" /></button></footer>
  </article>;
}

function KindBadge({ artifact }: { artifact: ResearchArtifact }) {
  const meta = kindMeta[artifact.kind];
  const Icon = meta.icon;
  return <span className={`result-kind is-${meta.tone}`}><Icon aria-hidden="true" />{meta.label}</span>;
}

function KindIcon({ kind }: { kind: ResearchArtifactKind }) {
  const Icon = kindMeta[kind].icon;
  return <i className={`result-side-icon is-${kindMeta[kind].tone}`}><Icon aria-hidden="true" /></i>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近更新";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function buildDonutGradient(data: ResearchResultsLibraryData | null) {
  const counts = data?.stats.byKind ?? { report: 0, ai: 0, snapshot: 0, comparison: 0 };
  const total = Math.max(1, counts.report + counts.ai + counts.snapshot + counts.comparison);
  const report = counts.report / total * 100;
  const ai = report + counts.ai / total * 100;
  const snapshot = ai + counts.snapshot / total * 100;
  return `conic-gradient(#4f8cff 0 ${report}%, #9b74f2 ${report}% ${ai}%, #42c6c8 ${ai}% ${snapshot}%, #e8a15d ${snapshot}% 100%)`;
}
