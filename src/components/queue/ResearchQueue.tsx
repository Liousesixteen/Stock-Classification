"use client";

import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock3,
  Database,
  FileCheck2,
  FileText,
  Flag,
  FolderArchive,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ResearchQueue as ResearchQueueData, ResearchQueueItem } from "@/lib/repositories/researchQueue";

type QueueView = "all" | "attention" | "running";
type TaskAction = "start" | "complete" | "dismiss" | "retry";

const emptyQueue: ResearchQueueData = {
  items: [],
  stats: { 已关注: 0, 待复核: 0, 缺证据: 0, 资料过期: 0, 待建档: 0, 同步失败: 0, 待补资料: 0, 成果待完善: 0 },
};

export function ResearchQueue({ refreshKey, onOpenCompany, onOpenTarget, compact = false, onClose }: {
  refreshKey: number;
  onOpenCompany: (stockCode: string, categoryId: number | null) => void;
  onOpenTarget?: (item: ResearchQueueItem) => void;
  compact?: boolean;
  onClose?: () => void;
}) {
  const [data, setData] = useState<ResearchQueueData | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<QueueView>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<"attention" | "running">>(new Set());
  const [actionTaskId, setActionTaskId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");

  const loadQueue = useCallback(() => {
    let active = true;
    const promise = (async () => {
      setLoadStatus("loading");
      try {
        let response = await fetch(`/api/research-queue?retry=${reloadKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reconcile" }),
          cache: "no-store",
        });
        let payload: { queue?: ResearchQueueData } | ResearchQueueData | null = null;
        if (response.ok) payload = await response.json() as { queue?: ResearchQueueData };
        else {
          response = await fetch(`/api/research-queue?fallback=${reloadKey}`, { cache: "no-store" });
          if (response.ok) payload = await response.json() as ResearchQueueData;
        }
        const queue = payload && "queue" in payload ? payload.queue : payload as ResearchQueueData | null;
        if (!response.ok || !queue?.items) throw new Error("queue unavailable");
        if (!active) return;
        setData(queue);
        setLoadStatus("ready");
        setSelectedTaskId((current) => queue.items.some((item) => item.taskId === current) ? current : null);
      } catch {
        if (!active) return;
        setData((current) => current ?? emptyQueue);
        setLoadStatus("error");
      }
    })();
    return { promise, cancel: () => { active = false; } };
  }, [reloadKey]);

  useEffect(() => {
    const request = loadQueue();
    return request.cancel;
  }, [loadQueue, refreshKey]);

  const normalizedQuery = query.trim().toLowerCase();
  const matchingItems = useMemo(() => (data?.items ?? []).filter((item) => {
    if (view === "attention" && item.taskStatus === "in_progress") return false;
    if (view === "running" && item.taskStatus !== "in_progress") return false;
    if (!normalizedQuery) return true;
    return [item.shortName, item.stockCode, item.categoryName, item.taskTitle, item.taskDescription, item.fieldKey, ...item.reasons]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  }), [data, normalizedQuery, view]);

  const attentionItems = matchingItems.filter((item) => item.taskStatus !== "in_progress");
  const runningItems = matchingItems.filter((item) => item.taskStatus === "in_progress");
  const attentionCount = data?.items.filter((item) => item.taskStatus !== "in_progress").length ?? 0;
  const runningCount = data?.items.filter((item) => item.taskStatus === "in_progress").length ?? 0;
  const selectedItem = data?.items.find((item) => item.taskId === selectedTaskId) ?? null;

  const openTarget = (item: ResearchQueueItem) => {
    if (onOpenTarget) onOpenTarget(item);
    else if (item.stockCode) onOpenCompany(item.stockCode, item.categoryId);
  };

  const runTaskAction = async (item: ResearchQueueItem, action: TaskAction) => {
    setActionError("");
    setActionTaskId(item.taskId);
    try {
      const response = await fetch("/api/research-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: item.taskId, action }),
      });
      const payload = await response.json() as { error?: string; queue?: ResearchQueueData };
      if (!response.ok) throw new Error(payload.error || "任务操作失败");
      if (payload.queue) setData(payload.queue);
      else await loadQueue().promise;
      setSelectedTaskId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "任务操作失败");
    } finally {
      setActionTaskId(null);
    }
  };

  const toggleGroup = (group: "attention" | "running") => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <section className={`task-center-system ${compact ? "is-drawer" : ""}`} data-testid="research-queue">
      <header className="task-system-header">
        <div className="task-system-heading">
          <span><Sparkles aria-hidden="true" />SYSTEM OPERATIONS</span>
          <h2>系统任务</h2>
          <p>集中处理研究流程中的异常、核验与资料缺口</p>
        </div>
        <div className="task-system-summary" aria-label="任务概览">
          <span className="is-attention"><i />需处理 <b>{attentionCount}</b></span>
          <span className="is-running"><i />进行中 <b>{runningCount}</b></span>
        </div>
        {onClose ? <button className="task-system-close" type="button" aria-label="关闭任务中心" onClick={onClose}><X aria-hidden="true" /></button> : null}
      </header>

      <div className="task-system-tools">
        <label className="task-system-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、代码或任务" /></label>
        <nav aria-label="任务状态筛选">
          <button type="button" className={view === "all" ? "is-active" : ""} onClick={() => setView("all")}>全部 <b>{data?.items.length ?? 0}</b></button>
          <button type="button" className={view === "attention" ? "is-active" : ""} onClick={() => setView("attention")}>需处理 <b>{attentionCount}</b></button>
          <button type="button" className={view === "running" ? "is-active" : ""} onClick={() => setView("running")}>进行中 <b>{runningCount}</b></button>
        </nav>
      </div>

      <div className="task-system-scroll">
        {loadStatus === "loading" && !data ? <TaskState state="loading" onReload={() => undefined} /> : null}
        {loadStatus === "error" ? <TaskState state="error" onReload={() => setReloadKey((value) => value + 1)} /> : null}
        {loadStatus === "ready" && matchingItems.length === 0 ? <TaskState state="empty" onReload={() => setReloadKey((value) => value + 1)} /> : null}

        {attentionItems.length ? <TaskGroup title="需要处理" count={attentionItems.length} tone="attention" collapsed={collapsedGroups.has("attention")} onToggle={() => toggleGroup("attention")}>
          {attentionItems.map((item) => <TaskCard key={item.taskId} item={item} expanded={selectedItem?.taskId === item.taskId} busy={actionTaskId === item.taskId} error={selectedItem?.taskId === item.taskId ? actionError : ""} onSelect={() => setSelectedTaskId((current) => current === item.taskId ? null : item.taskId)} onOpen={() => openTarget(item)} onAction={(action) => void runTaskAction(item, action)} />)}
        </TaskGroup> : null}

        {runningItems.length ? <TaskGroup title="自动运行" count={runningItems.length} tone="running" collapsed={collapsedGroups.has("running")} onToggle={() => toggleGroup("running")}>
          {runningItems.map((item) => <TaskCard key={item.taskId} item={item} expanded={selectedItem?.taskId === item.taskId} busy={actionTaskId === item.taskId} error={selectedItem?.taskId === item.taskId ? actionError : ""} onSelect={() => setSelectedTaskId((current) => current === item.taskId ? null : item.taskId)} onOpen={() => openTarget(item)} onAction={(action) => void runTaskAction(item, action)} />)}
        </TaskGroup> : null}
      </div>

      <footer className="task-system-footer">
        <span><Clock3 aria-hidden="true" />系统任务按数据变化自动更新</span>
        <button type="button" onClick={() => setReloadKey((value) => value + 1)}><RefreshCcw aria-hidden="true" />刷新</button>
      </footer>
    </section>
  );
}

function TaskGroup({ title, count, tone, collapsed, onToggle, children }: { title: string; count: number; tone: "attention" | "running"; collapsed: boolean; onToggle: () => void; children: ReactNode }) {
  return <section className={`task-system-group is-${tone}`}>
    <button className="task-system-group-heading" type="button" aria-expanded={!collapsed} onClick={onToggle}>
      <span>{tone === "attention" ? <ShieldAlert aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}{title} <b>{count}</b></span>
      <ChevronDown aria-hidden="true" />
    </button>
    {!collapsed ? <div className="task-system-group-list">{children}</div> : null}
  </section>;
}

function TaskCard({ item, expanded, busy, error, onSelect, onOpen, onAction }: { item: ResearchQueueItem; expanded: boolean; busy: boolean; error: string; onSelect: () => void; onOpen: () => void; onAction: (action: TaskAction) => void }) {
  const meta = taskMeta(item);
  const Icon = meta.icon;
  return <article className={`task-row task-system-card is-${meta.tone} ${expanded ? "is-expanded is-active" : ""}`}>
    <button className="task-row-main task-system-card-summary" type="button" aria-expanded={expanded} onClick={onSelect}>
      <span className="task-system-status-dot" aria-hidden="true" />
      <span className="task-system-card-icon"><Icon aria-hidden="true" /></span>
      <span className="task-system-card-copy"><strong>{item.taskTitle || meta.label}</strong><small>{item.shortName}{item.stockCode ? ` · ${item.stockCode}` : ""}</small></span>
      <span className="task-system-card-meta"><b>{meta.label}</b><time>{relativeTime(item.updatedAt)}</time></span>
      <ChevronDown className="task-system-card-chevron" aria-hidden="true" />
    </button>
    {expanded ? <div className="task-system-card-detail">
      <p>{item.taskDescription || detailDescription(item)}</p>
      <dl>
        <div><dt>定位</dt><dd>{targetLabel(item)}</dd></div>
        <div><dt>关联对象</dt><dd>{item.categoryName || "系统研究"}</dd></div>
        <div><dt>证据状态</dt><dd>{item.evidenceCount ? `${item.evidenceCount} 条有效证据` : "尚缺有效证据"}</dd></div>
      </dl>
      <div className="task-system-next-step"><ShieldCheck aria-hidden="true" /><span><b>建议下一步</b><small>{nextStep(item)}</small></span></div>
      {error ? <p className="task-system-action-error" role="alert">{error}</p> : null}
      <div className="task-resolution-actions">
        <button type="button" onClick={onOpen}>打开精确位置 <ArrowRight aria-hidden="true" /></button>
        {item.taskStatus === "open" && item.taskType !== "sync_failure" ? <button type="button" disabled={busy} onClick={() => onAction("start")}>{busy ? "处理中" : "开始处理"}</button> : null}
        {item.taskType === "sync_failure" ? <button className="is-primary" type="button" disabled={busy} onClick={() => onAction("retry")}>{busy ? "正在重试" : "重新同步"}</button> : null}
        {item.canComplete ? <button className="is-primary" type="button" disabled={busy} onClick={() => onAction("complete")}>{busy ? "正在回写" : "确认完成"}</button> : null}
        <button type="button" disabled={busy} onClick={() => onAction("dismiss")}>暂不处理</button>
      </div>
    </div> : null}
  </article>;
}

function TaskState({ state, onReload }: { state: "loading" | "error" | "empty"; onReload: () => void }) {
  if (state === "loading") return <div className="task-system-state"><CircleDashed className="is-spinning" aria-hidden="true" /><b>正在同步系统任务</b><span>检查数据异常、证据状态与研究流程</span></div>;
  if (state === "error") return <div className="task-system-state is-error"><ShieldAlert aria-hidden="true" /><b>任务暂时无法读取</b><span>现有任务状态不会丢失，请重新尝试</span><button type="button" onClick={onReload}><RefreshCcw aria-hidden="true" />重新加载</button></div>;
  return <div className="task-system-state is-empty"><CheckCircle2 aria-hidden="true" /><b>当前没有待处理任务</b><span>系统会在发现资料缺口或流程异常时自动生成任务</span><button type="button" onClick={onReload}><RefreshCcw aria-hidden="true" />刷新状态</button></div>;
}

function taskMeta(item: ResearchQueueItem) {
  if (item.taskStatus === "in_progress") return { label: "执行中", tone: "running", icon: CircleDashed };
  if (item.reasons.includes("同步失败")) return { label: "同步异常", tone: "danger", icon: Database };
  if (item.reasons.includes("成果待完善")) return { label: "成果质检", tone: "violet", icon: FileText };
  if (item.reasons.includes("待复核")) return { label: "需人工复核", tone: "attention", icon: ShieldAlert };
  if (item.reasons.includes("资料过期")) return { label: "资料过期", tone: "warning", icon: CalendarClock };
  if (item.reasons.includes("待补资料")) return { label: "资料缺口", tone: "warning", icon: Database };
  if (item.reasons.includes("缺证据")) return { label: "缺少证据", tone: "info", icon: FileCheck2 };
  if (item.reasons.includes("待建档")) return { label: "待建档", tone: "warning", icon: FolderArchive };
  return { label: "研究任务", tone: "info", icon: Flag };
}

function targetLabel(item: ResearchQueueItem) {
  if (item.targetType === "field") return item.fieldKey ? `数据字段 · ${item.fieldKey}` : "数据字段";
  if (item.targetType === "report") return "研报写作";
  if (item.targetType === "industry") return "产业链图谱";
  if (item.targetType === "relation") return "产业链关系";
  if (item.targetType === "evidence") return "来源证据";
  return "公司档案";
}

function nextStep(item: ResearchQueueItem) {
  if (item.taskType === "sync_failure") return "重新发起公司资料同步，并检查失败的数据来源。";
  if (item.taskType === "low_confidence") return "打开产业链关系，核验业务占比与公开证据后确认结论。";
  if (item.taskType === "missing_evidence") return "优先补充公告、年报或公司官网等可追溯的一手来源。";
  if (item.taskType === "stale_evidence") return "更新过期来源，并确认原有判断是否仍然成立。";
  if (item.taskType === "report_quality") return "定位到报告问题项，补齐引用或修订结论后重新质检。";
  return `打开${targetLabel(item)}，完成缺失信息后回写任务状态。`;
}

function detailDescription(item: ResearchQueueItem) {
  return `核验${item.shortName}相关资料，补齐可追溯证据并更新当前研究状态。`;
}

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "待更新";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function ResearchQueueDrawer({ open, refreshKey, onClose, onOpenCompany }: { open: boolean; refreshKey: number; onClose: () => void; onOpenCompany: (stockCode: string, categoryId: number | null) => void }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);
  if (!open) return null;
  return <div className="research-queue-drawer research-queue-system-drawer" role="presentation"><button className="research-queue-backdrop" type="button" aria-label="关闭任务中心" onClick={onClose} /><aside className="research-queue-drawer-panel" role="dialog" aria-modal="true" aria-label="系统任务"><ResearchQueue compact refreshKey={refreshKey} onClose={onClose} onOpenCompany={onOpenCompany} /></aside></div>;
}
