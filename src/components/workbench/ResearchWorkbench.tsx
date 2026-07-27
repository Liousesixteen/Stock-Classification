"use client";

import {
  Activity,
  ArrowRight,
  Bot,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDashed,
  Clock3,
  FileCheck2,
  Files,
  FileText,
  Flame,
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
import { useEffect, useMemo, useState } from "react";
import type { ResearchQueue, ResearchQueueItem } from "@/lib/repositories/researchQueue";
import { CompanyDetails } from "./CompanyDetails";
import { ResearchIntelligenceDock, type IntelligenceTab } from "./ResearchIntelligenceDock";

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
  onChanged,
}: ResearchWorkbenchProps) {
  const [queue, setQueue] = useState<ResearchQueue | null>(null);
  const [activeView, setActiveView] = useState<ResearchView>("home");

  useEffect(() => {
    let active = true;
    fetch("/api/research-queue")
      .then((response) => response.ok ? response.json() as Promise<ResearchQueue> : Promise.reject(new Error("queue unavailable")))
      .then((payload) => { if (active) setQueue(payload); })
      .catch(() => {
        if (active) {
          setQueue({ items: [], stats: { 已关注: 0, 待复核: 0, 缺证据: 0, 资料过期: 0, 待建档: 0, 同步失败: 0, 待补资料: 0, 成果待完善: 0 } });
        }
      });
    return () => { active = false; };
  }, [refreshKey]);

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

  const selectQueueCompany = (item: ResearchQueueItem) => {
    setActiveView("profile");
    onSelectCompany(item.stockCode, item.categoryId);
  };

  return (
    <div className={`research-desk is-${activeView}`}>
      <div className={`research-desk-grid is-${activeView}`}>
        <section className={`research-file-stage ${activeView === "agents" || activeView === "report" ? "is-intelligence" : ""}`}>
          {activeView === "home" ? <ResearchDeskOverview
                queue={queue}
                onOpenCompany={selectQueueCompany}
                onOpenAi={() => setActiveView("agents")}
                onOpenReport={() => setActiveView("report")}
                onOpenAtlas={onOpenAtlas}
                onOpenSector={() => onOpenSector(selectedCategoryId)}
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
                onOpenCompany={selectQueueCompany}
                onOpenAi={() => setActiveView("agents")}
                onOpenReport={() => setActiveView("report")}
                onOpenAtlas={onOpenAtlas}
                onOpenSector={() => onOpenSector(selectedCategoryId)}
              />
          ) : (
            <ResearchIntelligenceDock
              embedded
              stockCode={selectedStockCode ?? queue?.items[0]?.stockCode ?? null}
              companyName={selectedItem?.shortName ?? queue?.items[0]?.shortName ?? ""}
              categoryId={selectedCategoryId ?? queue?.items[0]?.categoryId ?? null}
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

function ResearchDeskOverview({ queue, onOpenCompany, onOpenAi, onOpenReport, onOpenAtlas, onOpenSector }: {
  queue: ResearchQueue | null;
  onOpenCompany: (item: ResearchQueueItem) => void;
  onOpenAi: () => void;
  onOpenReport: () => void;
  onOpenAtlas: () => void;
  onOpenSector: () => void;
}) {
  const taskItems = queue?.items ?? [];
  const items = Array.from(
    new Map(
      taskItems
        .filter((item) => item.stockCode)
        .map((item) => [item.stockCode, item] as const),
    ).values(),
  );
  const activeItems = items.slice(0, 3);
  const recentItems = items.slice(0, 5);
  const watchItems = items.filter((item) => item.isWatchlist).slice(0, 5);
  const evidenceCount = items.reduce((total, item) => total + item.evidenceCount, 0);
  const profileCount = items.filter((item) => item.hasResearchProfile).length;
  const categoryCount = new Set(items.map((item) => item.categoryName)).size;
  const pendingCount = (queue?.stats.缺证据 ?? 0) + (queue?.stats.待建档 ?? 0) + (queue?.stats.待复核 ?? 0);

  return <div className="research-dashboard">
    <section className="research-dashboard-hero">
      <div className="research-dashboard-intro">
        <div><Sparkles aria-hidden="true" /><span>今日概览</span></div>
        <h2>研究工作台总览</h2>
        <p>管理今日研究任务、进度与成果</p>
        <small><CalendarDays aria-hidden="true" />今日 <i /> 进行中项目 {activeItems.length} 项</small>
      </div>
      <div className="research-dashboard-command">
        <label><Search aria-hidden="true" /><input placeholder="搜索研究项目 / 公司 / 行业 / 报告" /><kbd>⌘K</kbd></label>
        <span>快速继续</span>
        <div className="research-dashboard-resume">
          {activeItems.map((item, index) => <button key={queueItemKey(item, index)} type="button" onClick={() => onOpenCompany(item)} aria-label={`继续研究 ${item.shortName}`}>
            {index === 0 ? <Building2 /> : index === 1 ? <PieChart /> : <Activity />}
            <span><b>{item.shortName}（{item.stockCode}）</b><small>{index === 0 ? "公司深度研究" : index === 1 ? `${item.categoryName}行业研究` : "产业关系复核"}</small></span>
            <Play />
          </button>)}
        </div>
      </div>
      <div className="research-dashboard-entries">
        <span>快捷入口</span>
        <div>
          <button type="button" onClick={() => activeItems[0] && onOpenCompany(activeItems[0])}><Building2 /><b>公司研究</b></button>
          <button type="button" onClick={onOpenAi}><Bot /><b>AI 研究</b></button>
          <button type="button" onClick={onOpenAtlas}><Waypoints /><b>产业链图谱</b></button>
          <button type="button" onClick={onOpenReport}><Files /><b>报告工坊</b></button>
        </div>
      </div>
    </section>

    <section className="research-dashboard-metrics" aria-label="研究进度概览">
      <article><span className="is-cyan"><Building2 /></span><div><b>公司研究</b><small>进行中 {activeItems.length} 个 · 已建档 {profileCount} 个</small></div><em>{Math.min(99, Math.round(profileCount / Math.max(items.length, 1) * 100))}%</em></article>
      <article><span className="is-gold"><PieChart /></span><div><b>行业研究</b><small>覆盖 {categoryCount} 个细分方向</small></div><em>{Math.min(99, 38 + categoryCount)}%</em></article>
      <article><span className="is-green"><Activity /></span><div><b>证据研究</b><small>已沉淀 {evidenceCount} 条有效证据</small></div><em>{Math.min(99, 42 + evidenceCount)}%</em></article>
      <article><span className="is-blue"><FileText /></span><div><b>报告草稿</b><small>待撰写 {queue?.stats.待建档 ?? 0} 篇</small></div><strong>{profileCount}</strong></article>
      <article><span className="is-orange"><ListTodo /></span><div><b>待处理任务</b><small>待核验与资料补全</small></div><strong>{pendingCount}</strong></article>
    </section>

    <section className="research-dashboard-body">
      <aside className="dashboard-panel dashboard-recent">
        <header><h3>最近研究</h3><button type="button">查看全部 <ChevronRight /></button></header>
        <div>
          {recentItems.map((item, index) => <button type="button" key={queueItemKey(item, index)} onClick={() => onOpenCompany(item)}>
            <span className={`dashboard-recent-icon is-${index % 4}`}>{index === 0 ? <Building2 /> : index === 1 ? <Files /> : index === 2 ? <Activity /> : <Waypoints />}</span>
            <span><b>{item.shortName}（{item.stockCode}）{index === 0 ? "公司深度研究" : "研究档案"}</b><small>{item.categoryName} · {item.updatedAt || "最近更新"}</small></span>
            <em>{index < 2 ? "进行中" : item.hasResearchProfile ? "已完成" : "已保存"}</em>
          </button>)}
        </div>
      </aside>

      <section className="dashboard-panel dashboard-projects">
        <header><h3>正在进行的研究</h3><button type="button">全部 {items.length} <ChevronRight /></button></header>
        <div className="dashboard-project-cards">
          {activeItems.map((item, index) => {
            const progress = Math.min(88, 36 + item.evidenceCount * 13 + (item.hasResearchProfile ? 20 : 0));
            return <button type="button" key={queueItemKey(item, index)} onClick={() => onOpenCompany(item)}>
              <span>{index === 0 ? "公司研究" : index === 1 ? "行业研究" : "周期研究"}</span>
              <strong>{item.shortName}（{item.stockCode}）{index === 0 ? "公司深度研究" : `${item.categoryName}研究`}</strong>
              <small>更新于 {item.updatedAt || "今日"}</small>
              <ul><li><Check />产业链与业务定位</li><li><Check />证据质量与关系判断</li><li><CircleDashed />风险与催化因素</li></ul>
              <div><i style={{ width: `${progress}%` }} /></div><em>进度 {progress}%</em>
            </button>;
          })}
        </div>
        <div className="dashboard-templates">
          <header><h4>推荐研究模板</h4><button type="button">查看全部模板 <ChevronRight /></button></header>
          <div>
            <button type="button"><LayoutTemplate /><span><b>公司深度研究</b><small>全面梳理公司基本面</small></span></button>
            <button type="button" onClick={onOpenSector}><PieChart /><span><b>行业研究框架</b><small>行业空间、格局与竞争分析</small></span></button>
            <button type="button" onClick={onOpenAtlas}><Waypoints /><span><b>产业链图谱分析</b><small>上下游关系与价值链拆解</small></span></button>
            <button type="button" onClick={onOpenReport}><FileText /><span><b>周期研究框架</b><small>周期定位与供需判断</small></span></button>
          </div>
        </div>
      </section>

      <aside className="research-dashboard-side">
        <section className="dashboard-panel dashboard-todos">
          <header><h3>待处理任务</h3><button type="button">查看全部 <ChevronRight /></button></header>
          <button type="button"><FileCheck2 /><span>待验证证据</span><b>{queue?.stats.缺证据 ?? 0}</b></button>
          <button type="button"><Files /><span>待更新归档</span><b>{queue?.stats.待建档 ?? 0}</b></button>
          <button type="button"><FileText /><span>待撰写报告</span><b>{queue?.stats.待复核 ?? 0}</b></button>
          <button type="button" className="is-primary">去处理任务 <ArrowRight /></button>
        </section>
        <section className="dashboard-panel dashboard-suggestions">
          <header><h3>研究建议</h3><button type="button"><Activity /></button></header>
          {items.slice(0, 3).map((item, index) => <button type="button" key={queueItemKey(item, index)} onClick={() => onOpenCompany(item)}>
            <span>{index === 0 ? "公司" : index === 1 ? "行业" : "周期"}</span>
            <div><b>{item.shortName}（{item.stockCode}）</b><small>{index === 0 ? "证据完整度提升，建议继续跟踪" : index === 1 ? `${item.categoryName}产业关系待复核` : "关注近期业务变化"}</small></div>
            <em>热度 {92 - index * 5}<Flame /></em>
          </button>)}
        </section>
      </aside>
    </section>

    <section className="research-dashboard-bottom">
      <section className="dashboard-panel dashboard-watchlist">
        <header><h3>重点跟踪公司</h3><button type="button">管理分组 <ChevronRight /></button></header>
        <div className="dashboard-table-head"><span>公司名称</span><span>代码</span><span>分类方向</span><span>证据</span><span /></div>
        {(watchItems.length ? watchItems : items.slice(0, 5)).map((item, index) => <button type="button" key={queueItemKey(item, index)} onClick={() => onOpenCompany(item)}><b>{item.shortName}</b><span>{item.stockCode}</span><span>{item.categoryName}</span><em>{item.evidenceCount} 条</em><Star /></button>)}
      </section>
      <section className="dashboard-panel dashboard-reports">
        <header><h3>最近报告</h3><button type="button" onClick={onOpenReport}>查看全部 <ChevronRight /></button></header>
        {items.slice(0, 3).map((item, index) => <button type="button" key={queueItemKey(item, index)} onClick={onOpenReport}><span>{index + 1}</span><div><b>{item.shortName}{index === 0 ? "公司深度研究" : `${item.categoryName}研究`}</b><small>AI Research · {item.updatedAt || "最近更新"}</small></div><FileText /></button>)}
      </section>
      <section className="dashboard-panel dashboard-alerts">
        <header><h3>研究异动</h3><button type="button">更多异动 <ChevronRight /></button></header>
        {items.slice(0, 3).map((item, index) => <button type="button" key={queueItemKey(item, index)} onClick={() => onOpenCompany(item)}><Clock3 /><b>{item.shortName}</b><span>{index === 0 ? "新增业务证据，建议复核关系" : index === 1 ? "研究档案有待补全" : "产业链关联发生更新"}</span><em className={`is-${index}`}>{index === 0 ? "证据更新" : index === 1 ? "待补资料" : "关系异动"}</em></button>)}
      </section>
    </section>
  </div>;
}

function queueItemKey(item: ResearchQueueItem, index: number) {
  return item.taskId ? `task-${item.taskId}` : `relation-${item.relationId}-${index}`;
}
