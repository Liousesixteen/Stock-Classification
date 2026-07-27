"use client";

import {
  Activity,
  ArrowRight,
  Bot,
  Building2,
  CalendarDays,
  ChevronRight,
  FileCheck2,
  Files,
  FileText,
  LayoutTemplate,
  ListTodo,
  PieChart,
  Play,
  Search,
  Sparkles,
  Star,
  Waypoints,
} from "lucide-react";
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ResearchDashboard } from "@/lib/repositories/researchDashboard";
import type { ResearchQueue, ResearchQueueItem } from "@/lib/repositories/researchQueue";
import { CompanyDetails } from "./CompanyDetails";
import { ResearchIntelligenceDock, type IntelligenceTab } from "./ResearchIntelligenceDock";
import { WorkspaceState } from "./WorkspaceState";

type ResearchView = "home" | "profile" | IntelligenceTab;

type ResearchWorkbenchProps = {
  selectedCategoryId: number | null;
  selectedStockCode: string | null;
  refreshKey: number;
  homeKey?: number;
  focusTask?: ResearchQueueItem | null;
  onSelectCompany: (stockCode: string, categoryId: number | null) => void;
  onOpenAtlas: () => void;
  onOpenSector: (categoryId: number | null) => void;
  onOpenResults?: () => void;
  onOpenQueue?: () => void;
  onChanged: () => void;
};

export function ResearchWorkbench({
  selectedCategoryId,
  selectedStockCode,
  refreshKey,
  homeKey = 0,
  focusTask = null,
  onSelectCompany,
  onOpenAtlas,
  onOpenSector,
  onOpenResults = () => undefined,
  onOpenQueue = () => undefined,
  onChanged,
}: ResearchWorkbenchProps) {
  const [queue, setQueue] = useState<ResearchQueue | null>(null);
  const [dashboard, setDashboard] = useState<ResearchDashboard | null>(null);
  const [overviewStatus, setOverviewStatus] = useState<"loading" | "ready" | "error">("loading");
  const [overviewReloadKey, setOverviewReloadKey] = useState(0);
  const [activeView, setActiveView] = useState<ResearchView>("home");

  useEffect(() => {
    const controller = new AbortController();
    setOverviewStatus("loading");
    fetch("/api/research-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reconcile" }),
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() as Promise<{ queue: ResearchQueue }> : Promise.reject(new Error("queue unavailable")))
      .then(async ({ queue: payload }) => {
        setQueue(payload);
        const response = await fetch("/api/research-dashboard", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("dashboard unavailable");
        return response.json() as Promise<ResearchDashboard>;
      })
      .then((payload) => {
        setDashboard(payload);
        setOverviewStatus("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setOverviewStatus("error");
      });
    return () => controller.abort();
  }, [overviewReloadKey, refreshKey]);

  useEffect(() => {
    setActiveView("home");
  }, [homeKey]);

  useEffect(() => {
    if (!selectedStockCode) return;
    setActiveView(focusTask?.targetType === "report" ? "report" : "profile");
  }, [focusTask, selectedStockCode]);

  const selectedItem = useMemo(() => {
    if (!selectedStockCode) return null;
    return queue?.items.find((item) => item.stockCode === selectedStockCode && item.categoryId === selectedCategoryId)
      ?? queue?.items.find((item) => item.stockCode === selectedStockCode)
      ?? null;
  }, [queue, selectedCategoryId, selectedStockCode]);

  const selectCompany = (stockCode: string, categoryId: number | null) => {
    setActiveView("profile");
    onSelectCompany(stockCode, categoryId);
  };

  return (
    <div className={`research-desk is-${activeView}`}>
      <div className={`research-desk-grid is-${activeView}`}>
        <section className={`research-file-stage ${activeView === "agents" || activeView === "report" ? "is-intelligence" : ""}`}>
          {activeView === "home" ? <ResearchDeskOverview
                queue={queue}
                dashboard={dashboard}
                status={overviewStatus}
                onRetry={() => setOverviewReloadKey((value) => value + 1)}
                onOpenCompany={selectCompany}
                onOpenAi={() => setActiveView("agents")}
                onOpenReport={() => setActiveView("report")}
                onOpenAtlas={onOpenAtlas}
                onOpenSector={() => onOpenSector(selectedCategoryId)}
                onOpenResults={onOpenResults}
                onOpenQueue={onOpenQueue}
              /> : activeView === "profile" ? (
            selectedStockCode ? <CompanyDetails
                stockCode={selectedStockCode}
                selectedCategoryId={selectedCategoryId}
                onChanged={onChanged}
                refreshKey={refreshKey}
                focusSectionId={focusTask ? sectionForTask(focusTask) : undefined}
                onOpenAi={() => setActiveView("agents")}
                onOpenReport={() => setActiveView("report")}
                onOpenAtlas={onOpenAtlas}
                onOpenSector={() => onOpenSector(selectedCategoryId)}
              /> : <ResearchDeskOverview
                queue={queue}
                dashboard={dashboard}
                status={overviewStatus}
                onRetry={() => setOverviewReloadKey((value) => value + 1)}
                onOpenCompany={selectCompany}
                onOpenAi={() => setActiveView("agents")}
                onOpenReport={() => setActiveView("report")}
                onOpenAtlas={onOpenAtlas}
                onOpenSector={() => onOpenSector(selectedCategoryId)}
                onOpenResults={onOpenResults}
                onOpenQueue={onOpenQueue}
              />
          ) : (
            <ResearchIntelligenceDock
              embedded
              stockCode={selectedStockCode ?? queue?.items[0]?.stockCode ?? dashboard?.companies[0]?.stockCode ?? null}
              companyName={selectedItem?.shortName ?? queue?.items[0]?.shortName ?? dashboard?.companies[0]?.shortName ?? ""}
              categoryId={selectedCategoryId ?? queue?.items[0]?.categoryId ?? dashboard?.companies[0]?.categoryId ?? null}
              tab={activeView}
              onTabChange={setActiveView}
              onClose={() => setActiveView("profile")}
            />
          )}
        </section>

      </div>
    </div>
  );
}

function sectionForTask(task: ResearchQueueItem) {
  if (task.targetType === "relation") return "company-section-2";
  if (task.targetType === "evidence") return "company-section-6";
  if (task.targetType !== "field") return "company-section-0";
  if (["revenue", "netProfit", "operatingCashFlow", "debtRatio", "price", "peTtm"].includes(task.fieldKey)) return "company-section-3";
  if (["announcements", "researchReports"].includes(task.fieldKey)) return "company-section-6";
  return "company-section-1";
}

function ResearchDeskOverview({
  queue,
  dashboard,
  status,
  onRetry,
  onOpenCompany,
  onOpenAi,
  onOpenReport,
  onOpenAtlas,
  onOpenSector,
  onOpenResults,
  onOpenQueue,
}: {
  queue: ResearchQueue | null;
  dashboard: ResearchDashboard | null;
  status: "loading" | "ready" | "error";
  onRetry: () => void;
  onOpenCompany: (stockCode: string, categoryId: number | null) => void;
  onOpenAi: () => void;
  onOpenReport: () => void;
  onOpenAtlas: () => void;
  onOpenSector: () => void;
  onOpenResults: () => void;
  onOpenQueue: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const companies = dashboard?.companies ?? [];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleCompanies = companies.filter((company) =>
    !normalizedQuery
    || [company.shortName, company.stockCode, company.categoryName].join(" ").toLocaleLowerCase().includes(normalizedQuery),
  );
  const activeItems = visibleCompanies.slice(0, 3);
  const watchItems = companies.filter((company) => company.isWatchlist).slice(0, 5);
  const reportArtifacts = (dashboard?.recentArtifacts ?? []).filter((artifact) => artifact.kind === "report").slice(0, 3);
  const latestTasks = (queue?.items ?? []).slice(0, 3);
  const pendingCount = dashboard?.stats.openTasks ?? 0;

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  if (status === "loading" && !dashboard) {
    return <WorkspaceState state="loading" title="正在读取研究工作区" description="汇总公司档案、有效证据、成果与任务" />;
  }
  if (status === "error" && !dashboard) {
    return <WorkspaceState state="error" title="研究工作台加载失败" description="没有把未知状态误报为零；请重新读取本地数据。" onAction={onRetry} />;
  }

  return <div className="research-dashboard">
    <section className="research-dashboard-hero">
      <div className="research-dashboard-intro">
        <div><Sparkles aria-hidden="true" /><span>{dashboard?.mode === "starter" ? "首次使用" : "研究概览"}</span></div>
        <h2>研究工作台总览</h2>
        <p>{dashboard?.mode === "starter" ? "当前展示的是示例公司目录，尚未计入真实研究进度。" : "所有数字均来自本地档案、证据、成果和任务记录。"}</p>
        <small><CalendarDays aria-hidden="true" />当前工作区 <i /> 活跃公司 {dashboard?.stats.activeCompanies ?? 0} 家</small>
      </div>
      <div className="research-dashboard-command">
        <label><Search aria-hidden="true" /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && visibleCompanies[0]) onOpenCompany(visibleCompanies[0].stockCode, visibleCompanies[0].categoryId);
        }} placeholder="搜索公司、代码或产业方向" aria-label="搜索研究公司" /><kbd>⌘K</kbd></label>
        <span>{dashboard?.mode === "starter" ? "从示例目录开始" : "快速继续"}</span>
        <div className="research-dashboard-resume">
          {activeItems.map((item, index) => <button key={item.stockCode} type="button" onClick={() => onOpenCompany(item.stockCode, item.categoryId)} aria-label={`${item.isStarterExample ? "打开示例公司" : "继续研究"} ${item.shortName}`}>
            {index === 0 ? <Building2 /> : index === 1 ? <PieChart /> : <Activity />}
            <span><b>{item.shortName}（{item.stockCode}）</b><small>{item.isStarterExample ? `示例目录 · ${item.categoryName}` : `${item.categoryName} · ${item.evidenceCount} 条有效证据`}</small></span>
            <Play />
          </button>)}
          {!activeItems.length ? <p>没有匹配的公司，可从产业链图谱添加标的。</p> : null}
        </div>
      </div>
      <div className="research-dashboard-entries">
        <span>快捷入口</span>
        <div>
          <button type="button" onClick={() => activeItems[0] && onOpenCompany(activeItems[0].stockCode, activeItems[0].categoryId)} disabled={!activeItems.length}><Building2 /><b>公司研究</b></button>
          <button type="button" onClick={onOpenAi}><Bot /><b>AI 研究</b></button>
          <button type="button" onClick={onOpenAtlas}><Waypoints /><b>产业链图谱</b></button>
          <button type="button" onClick={onOpenReport}><Files /><b>报告工坊</b></button>
        </div>
      </div>
    </section>

    <section className="research-dashboard-metrics" aria-label="研究进度概览">
      <article><span className="is-cyan"><Building2 /></span><div><b>活跃公司</b><small>目录共 {dashboard?.stats.catalogCompanies ?? 0} 家</small></div><strong>{dashboard?.stats.activeCompanies ?? 0}</strong></article>
      <article><span className="is-gold"><PieChart /></span><div><b>研究赛道</b><small>有真实研究活动的方向</small></div><strong>{dashboard?.stats.activeCategories ?? 0}</strong></article>
      <article><span className="is-green"><Activity /></span><div><b>有效证据</b><small>已核验或具备可追溯链接</small></div><strong>{dashboard?.stats.effectiveEvidence ?? 0}</strong></article>
      <article><span className="is-blue"><FileText /></span><div><b>研究成果</b><small>{dashboard?.stats.aiRuns ?? 0} 次 AI 研究</small></div><strong>{dashboard?.stats.reports ?? 0}</strong></article>
      <article><span className="is-orange"><ListTodo /></span><div><b>待处理任务</b><small>待核验与资料补全</small></div><strong>{pendingCount}</strong></article>
    </section>

    <section className="research-dashboard-body">
      <aside className="dashboard-panel dashboard-recent">
        <header><h3>最近成果</h3><button type="button" onClick={onOpenResults}>查看全部 <ChevronRight /></button></header>
        <div>
          {(dashboard?.recentArtifacts ?? []).slice(0, 5).map((artifact, index) => <button type="button" key={artifact.id} onClick={onOpenResults}>
            <span className={`dashboard-recent-icon is-${index % 4}`}>{artifact.kind === "report" ? <Files /> : <Activity />}</span>
            <span><b>{artifact.title}</b><small>{artifact.categoryName} · {artifact.evidenceCount} 条引用</small></span>
            <em>{artifact.stage === "ready" ? "可用" : "待完善"}</em>
          </button>)}
          {!dashboard?.recentArtifacts.length ? <p>还没有真实成果。完成一次 AI 研究或生成研报后会出现在这里。</p> : null}
        </div>
      </aside>

      <section className="dashboard-panel dashboard-projects">
        <header><h3>{dashboard?.mode === "starter" ? "示例公司目录" : "正在进行的研究"}</h3><button type="button" onClick={onOpenAtlas}>进入图谱 <ChevronRight /></button></header>
        <div className="dashboard-project-cards">
          {activeItems.map((item) => <button type="button" key={item.stockCode} onClick={() => onOpenCompany(item.stockCode, item.categoryId)}>
            <span>{item.isStarterExample ? "示例目录" : item.isWatchlist ? "重点跟踪" : "公司研究"}</span>
            <strong>{item.shortName}（{item.stockCode}）</strong>
            <small>{item.categoryName} · {item.updatedAt?.slice(0, 10) || "时间待补"}</small>
            <ul><li>{item.hasResearchProfile ? "研究档案已建立" : "研究档案待建立"}</li><li>{item.evidenceCount} 条有效证据</li><li>{item.isWatchlist ? "已加入重点跟踪" : "未加入重点跟踪"}</li></ul>
            <em>{item.isStarterExample ? "尚未开始研究" : "打开档案"}</em>
          </button>)}
        </div>
        <div className="dashboard-templates">
          <header><h4>研究入口</h4></header>
          <div>
            <button type="button" onClick={() => activeItems[0] && onOpenCompany(activeItems[0].stockCode, activeItems[0].categoryId)} disabled={!activeItems.length}><LayoutTemplate /><span><b>公司深度研究</b><small>全面梳理公司基本面</small></span></button>
            <button type="button" onClick={onOpenSector}><PieChart /><span><b>行业研究框架</b><small>行业空间、格局与竞争分析</small></span></button>
            <button type="button" onClick={onOpenAtlas}><Waypoints /><span><b>产业链图谱分析</b><small>上下游关系与价值链拆解</small></span></button>
            <button type="button" onClick={onOpenReport}><FileText /><span><b>周期研究框架</b><small>周期定位与供需判断</small></span></button>
          </div>
        </div>
      </section>

      <aside className="research-dashboard-side">
        <section className="dashboard-panel dashboard-todos">
          <header><h3>待处理任务</h3><button type="button" onClick={onOpenQueue}>查看全部 <ChevronRight /></button></header>
          <button type="button" onClick={onOpenQueue}><FileCheck2 /><span>待补有效证据</span><b>{queue?.stats.缺证据 ?? 0}</b></button>
          <button type="button" onClick={onOpenQueue}><Files /><span>待建立档案</span><b>{queue?.stats.待建档 ?? 0}</b></button>
          <button type="button" onClick={onOpenQueue}><FileText /><span>待复核关系</span><b>{queue?.stats.待复核 ?? 0}</b></button>
          <button type="button" className="is-primary" onClick={onOpenQueue}>去处理任务 <ArrowRight /></button>
        </section>
        <section className="dashboard-panel dashboard-suggestions">
          <header><h3>可信边界</h3><Activity aria-hidden="true" /></header>
          <p>“有效证据”仅统计已核验资料，或具备可追溯 HTTP(S) 原文链接且未过期、未驳回的来源。</p>
          <p>示例公司不进入任务、进度与成果统计；打开档案并保存研究后才会转为活跃标的。</p>
        </section>
      </aside>
    </section>

    <section className="research-dashboard-bottom">
      <section className="dashboard-panel dashboard-watchlist">
        <header><h3>重点跟踪公司</h3><button type="button" onClick={onOpenAtlas}>在图谱管理 <ChevronRight /></button></header>
        <div className="dashboard-table-head"><span>公司名称</span><span>代码</span><span>分类方向</span><span>证据</span><span /></div>
        {watchItems.map((item) => <button type="button" key={item.stockCode} onClick={() => onOpenCompany(item.stockCode, item.categoryId)}><b>{item.shortName}</b><span>{item.stockCode}</span><span>{item.categoryName}</span><em>{item.evidenceCount} 条</em><Star /></button>)}
        {!watchItems.length ? <p>尚未设置重点跟踪公司。</p> : null}
      </section>
      <section className="dashboard-panel dashboard-reports">
        <header><h3>最近报告</h3><button type="button" onClick={onOpenResults}>查看全部 <ChevronRight /></button></header>
        {reportArtifacts.map((artifact, index) => <button type="button" key={artifact.id} onClick={onOpenResults}><span>{index + 1}</span><div><b>{artifact.title}</b><small>{artifact.evidenceCount} 条引用 · 完整度 {artifact.completeness}%</small></div><FileText /></button>)}
        {!reportArtifacts.length ? <p>还没有已保存的报告。</p> : null}
      </section>
      <section className="dashboard-panel dashboard-alerts">
        <header><h3>最新任务</h3><button type="button" onClick={onOpenQueue}>更多任务 <ChevronRight /></button></header>
        {latestTasks.map((item, index) => <button type="button" key={queueItemKey(item, index)} onClick={onOpenQueue}><ListTodo /><b>{item.shortName}</b><span>{item.taskTitle}</span><em className={`is-${index}`}>{item.reasons[0]}</em></button>)}
        {!latestTasks.length ? <p>当前没有待处理任务。</p> : null}
      </section>
    </section>
  </div>;
}

function queueItemKey(item: ResearchQueueItem, index: number) {
  return item.taskId ? `task-${item.taskId}` : `relation-${item.relationId}-${index}`;
}
