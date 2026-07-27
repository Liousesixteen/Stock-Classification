"use client";

import {
  Archive,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileText,
  Flag,
  FolderArchive,
  Lightbulb,
  ListChecks,
  MoreVertical,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ResearchQueue as ResearchQueueData, ResearchQueueItem, ResearchQueueReason } from "@/lib/repositories/researchQueue";
import { ResizablePanelControls, useResizablePanelLayout } from "@/components/workbench/ResizablePanelControls";
import { WorkspaceState } from "@/components/workbench/WorkspaceState";

type QueueFilter = "全部" | ResearchQueueReason;
type QueueSort = "priority" | "updated" | "evidence";

const filterMeta: Array<{ id: QueueFilter; label: string; icon: typeof Flag; hint: string }> = [
  { id: "全部", label: "全部任务", icon: ListChecks, hint: "全部待办" },
  { id: "已关注", label: "高优任务", icon: Flag, hint: "优先跟踪" },
  { id: "待复核", label: "关系核验", icon: ClipboardCheck, hint: "关系待确认" },
  { id: "缺证据", label: "证据补充", icon: FileCheck2, hint: "补充来源" },
  { id: "资料过期", label: "资料过期", icon: CalendarClock, hint: "更新时效" },
  { id: "待建档", label: "档案完善", icon: FolderArchive, hint: "沉淀研究" },
  { id: "同步失败", label: "同步失败", icon: CircleDashed, hint: "重试数据源" },
  { id: "待补资料", label: "待补资料", icon: Database, hint: "字段缺口" },
  { id: "成果待完善", label: "成果质检", icon: FileText, hint: "报告待修订" },
];
const queueLeftPanel = { defaultWidth: 176, minWidth: 142, maxWidth: 260 };
const queueRightPanel = { defaultWidth: 330, minWidth: 260, maxWidth: 460 };

export function ResearchQueue({ refreshKey, onOpenCompany, onOpenTarget, compact = false, onClose }: {
  refreshKey: number;
  onOpenCompany: (stockCode: string, categoryId: number | null) => void;
  onOpenTarget?: (item: ResearchQueueItem) => void;
  compact?: boolean;
  onClose?: () => void;
}) {
  const [data, setData] = useState<ResearchQueueData | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("全部");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<QueueSort>("priority");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelection, setBatchSelection] = useState<Set<number>>(new Set());
  const [actionError, setActionError] = useState("");
  const [actionTaskId, setActionTaskId] = useState<number | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const panels = useResizablePanelLayout("stock-classification:task-panels", queueLeftPanel, queueRightPanel);

  const loadQueue = useCallback(() => {
    let active = true;
    setLoadStatus("loading");
    const promise = fetch(`/api/research-queue?retry=${reloadKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reconcile" }),
      cache: "no-store",
    })
      .then((response) => response.ok ? response.json() as Promise<{ queue: ResearchQueueData }> : Promise.reject(new Error("queue unavailable")))
      .then(({ queue: payload }) => {
        if (!active) return;
        setData(payload);
        setLoadStatus("ready");
        setSelectedTaskId((current) => payload.items.some((item) => item.taskId === current) ? current : payload.items[0]?.taskId ?? null);
      })
      .catch(() => {
        if (active) {
          setData((current) => current ?? { items: [], stats: emptyQueueStats() });
          setLoadStatus("error");
        }
      });
    return { promise, cancel: () => { active = false; } };
  }, [reloadKey]);

  useEffect(() => {
    const request = loadQueue();
    return request.cancel;
  }, [loadQueue, refreshKey]);

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.items ?? [])
      .filter((item) => filter === "全部" || item.reasons.includes(filter))
      .filter((item) => !normalized || [item.shortName, item.stockCode, item.categoryName, item.relationType, ...item.reasons].join(" ").toLowerCase().includes(normalized))
      .sort((left, right) => {
        if (sort === "updated") return right.updatedAt.localeCompare(left.updatedAt);
        if (sort === "evidence") return left.evidenceCount - right.evidenceCount;
        return right.priority - left.priority || right.updatedAt.localeCompare(left.updatedAt);
      });
  }, [data, filter, query, sort]);

  const selectedItem = data?.items.find((item) => item.taskId === selectedTaskId) ?? items[0] ?? null;
  const highPriority = data?.items.filter((item) => item.priority >= 70).length ?? 0;
  const missingEvidence = data?.stats.缺证据 ?? 0;
  const pendingProfile = data?.stats.待建档 ?? 0;
  const pendingReview = data?.stats.待复核 ?? 0;

  const toggleBatch = (taskId: number) => {
    const next = new Set(batchSelection);
    if (next.has(taskId)) next.delete(taskId);
    else next.add(taskId);
    setBatchSelection(next);
  };

  const openTarget = (item: ResearchQueueItem) => {
    if (onOpenTarget) onOpenTarget(item);
    else if (item.stockCode) onOpenCompany(item.stockCode, item.categoryId);
  };

  const runTaskAction = async (item: ResearchQueueItem, action: "start" | "complete" | "dismiss" | "retry") => {
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
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "任务操作失败");
    } finally {
      setActionTaskId(null);
    }
  };

  return (
    <section
      className={`task-center ${compact ? "is-drawer" : ""} ${panels.layout.leftCollapsed ? "is-left-panel-collapsed" : ""} ${panels.layout.rightCollapsed ? "is-right-panel-collapsed" : ""}`}
      data-testid="research-queue"
      style={panels.style}
    >
      <header className="task-center-hero">
        <div className="task-center-title">
          <span><Sparkles aria-hidden="true" />RESEARCH OPERATIONS</span>
          <h2>任务中心</h2>
          <p>把待验证、待补证、待归档与待产出转化为下一步研究行动</p>
        </div>
        <div className="task-center-metrics">
          <TaskMetric tone="red" icon={Flag} label="高优任务" value={highPriority} delta="优先处理" />
          <TaskMetric tone="orange" icon={ShieldCheck} label="待核验关系" value={pendingReview} delta="关系判断" />
          <TaskMetric tone="blue" icon={FileCheck2} label="待补关键证据" value={missingEvidence} delta="证据缺口" />
          <TaskMetric tone="violet" icon={FileText} label="待建研究档案" value={pendingProfile} delta="结构化沉淀" />
        </div>
        {onClose ? <button className="task-center-close" type="button" aria-label="关闭任务中心" onClick={onClose}><X aria-hidden="true" /></button> : null}
      </header>

      <div className="task-center-toolbar">
        <label className="task-center-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、赛道、任务类型或关键词" /></label>
        <nav aria-label="任务快速筛选">
          {filterMeta.map(({ id, label }) => <button type="button" key={id} className={filter === id ? "is-active" : ""} onClick={() => setFilter(id)}>{label}<b>{id === "全部" ? data?.items.length ?? 0 : data?.stats[id] ?? 0}</b></button>)}
        </nav>
        <label className="task-center-sort"><select value={sort} onChange={(event) => setSort(event.target.value as QueueSort)} aria-label="任务排序"><option value="priority">优先级排序</option><option value="updated">最近更新</option><option value="evidence">证据缺口</option></select><ChevronDown aria-hidden="true" /></label>
        <button className={`task-center-batch ${batchMode ? "is-active" : ""}`} type="button" onClick={() => { setBatchMode((value) => !value); setBatchSelection(new Set()); }}><ListChecks aria-hidden="true" />{batchMode ? "退出批量" : "批量处理"}</button>
      </div>

      <div className="task-center-layout">
        <ResizablePanelControls layout={panels.layout} bounds={panels.bounds} onResize={panels.resize} onResizeByKeyboard={panels.resizeByKeyboard} onToggle={panels.toggle} />
        <aside className="task-filter-rail">
          <FilterSection title="任务分类">
            {filterMeta.map(({ id, label, icon: Icon, hint }) => <button type="button" key={id} className={filter === id ? "is-active" : ""} onClick={() => setFilter(id)}><Icon aria-hidden="true" /><span>{label}<small>{hint}</small></span><b>{id === "全部" ? data?.items.length ?? 0 : data?.stats[id] ?? 0}</b></button>)}
          </FilterSection>
          <FilterSection title="优先级">
            <div className="task-priority-legend"><span><i className="is-high" />高优 <b>{highPriority}</b></span><span><i className="is-medium" />中优 <b>{data?.items.filter((item) => item.priority >= 30 && item.priority < 70).length ?? 0}</b></span><span><i className="is-low" />低优 <b>{data?.items.filter((item) => item.priority < 30).length ?? 0}</b></span></div>
          </FilterSection>
          <FilterSection title="赛道筛选">
            <label className="task-track-select">全部赛道<ChevronDown aria-hidden="true" /></label>
            {Array.from(new Set((data?.items ?? []).map((item) => item.categoryName))).slice(0, 6).map((name) => <button className="task-track-button" type="button" key={name} onClick={() => setQuery(name)}><span>{name}</span><b>{data?.items.filter((item) => item.categoryName === name).length}</b></button>)}
          </FilterSection>
        </aside>

        <section className="task-list-panel" aria-label="任务列表">
          <div className="task-list-heading"><span>共 {items.length} 项任务</span>{batchMode && batchSelection.size ? <button type="button" onClick={() => { const first = items.find((item) => batchSelection.has(item.taskId)); if (first) openTarget(first); }}>处理已选 {batchSelection.size} 项<ArrowRight aria-hidden="true" /></button> : null}</div>
          {loadStatus === "loading" && !data ? <WorkspaceState compact state="loading" title="正在计算研究任务" description="检测字段、证据、关系与报告质量" /> : null}
          {loadStatus === "error" ? <WorkspaceState compact state="error" title="任务中心加载失败" description="已有任务状态不会丢失，可原地重新读取。" onAction={() => setReloadKey((value) => value + 1)} /> : null}
          {loadStatus === "ready" && data && items.length === 0 ? <WorkspaceState compact state="empty" title="当前筛选下没有待处理任务" description="更换筛选条件，或返回工作台继续研究。" icon={<CheckCircle2 aria-hidden="true" />} /> : null}
          <div className="task-list-scroll">
            {items.map((item) => <TaskRow key={item.taskId} item={item} active={selectedItem?.taskId === item.taskId} batchMode={batchMode} checked={batchSelection.has(item.taskId)} onCheck={() => toggleBatch(item.taskId)} onSelect={() => setSelectedTaskId(item.taskId)} onOpen={() => item.taskType === "sync_failure" ? void runTaskAction(item, "retry") : openTarget(item)} busy={actionTaskId === item.taskId} />)}
          </div>
        </section>

        <aside className="task-detail-panel">
          {selectedItem ? <TaskDetail item={selectedItem} onOpen={() => openTarget(selectedItem)} onAction={(action) => runTaskAction(selectedItem, action)} busy={actionTaskId === selectedItem.taskId} error={actionError} /> : <div className="task-center-state"><ListChecks aria-hidden="true" />请选择一项任务查看执行详情</div>}
        </aside>
      </div>
    </section>
  );
}

function TaskMetric({ tone, icon: Icon, label, value, delta }: { tone: string; icon: typeof Flag; label: string; value: number; delta: string }) {
  return <article className={`task-metric is-${tone}`}><span><Icon aria-hidden="true" /></span><div><small>{label}</small><b>{value}</b><em>{delta}</em></div><i className="task-metric-signal"><u /><u /><u /><u /><u /></i></article>;
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return <section><header><h3>{title}</h3><ChevronDown aria-hidden="true" /></header>{children}</section>;
}

function TaskRow({ item, active, batchMode, checked, onCheck, onSelect, onOpen, busy }: { item: ResearchQueueItem; active: boolean; batchMode: boolean; checked: boolean; onCheck: () => void; onSelect: () => void; onOpen: () => void; busy: boolean }) {
  const meta = taskMeta(item);
  const target = 1;
  const progress = Math.min(100, Math.round(item.evidenceCount / target * 100));
  return <article className={`task-row ${active ? "is-active" : ""}`}>
    {batchMode ? <label className="task-select"><input type="checkbox" checked={checked} onChange={onCheck} aria-label={`选择 ${item.shortName}`} /><span><Check aria-hidden="true" /></span></label> : <span className={`task-company-icon is-${meta.tone}`}><Building2 aria-hidden="true" /></span>}
    <button className="task-row-main" type="button" onClick={onSelect}>
      <span className="task-company"><strong>{item.shortName}</strong><small>{item.stockCode} · {item.categoryName}</small></span>
      <span className={`task-priority is-${priorityTone(item.priority)}`}>{priorityLabel(item.priority)}</span>
      <span className={`task-kind is-${meta.tone}`}>{meta.label}</span>
      <span className="task-description"><b>{meta.description}</b><small>关联赛道　{item.categoryName} · {item.relationType}</small></span>
      <span className="task-evidence"><small>证据</small><b>{item.evidenceCount}/{target}</b><i><u style={{ width: `${progress}%` }} /></i></span>
      <span className="task-confidence"><b>{item.confidence || "待定"}</b><small>置信等级</small></span>
      <span className="task-updated"><small>更新</small><b>{formatDateTime(item.updatedAt)}</b></span>
    </button>
    <button className="task-action" type="button" onClick={onOpen} disabled={busy}>{busy ? "处理中" : meta.action}</button>
    <button className="task-more" type="button" title="更多任务操作"><MoreVertical aria-hidden="true" /></button>
  </article>;
}

function TaskDetail({ item, onOpen, onAction, busy, error }: { item: ResearchQueueItem; onOpen: () => void; onAction: (action: "start" | "complete" | "dismiss" | "retry") => void; busy: boolean; error: string }) {
  const meta = taskMeta(item);
  const requirements = evidenceRequirements(item);
  const target = 1;
  return <>
    <header className="task-detail-heading"><span>任务详情</span><MoreVertical aria-hidden="true" /></header>
    <section className="task-detail-summary">
      <div><span className={`task-kind is-${meta.tone}`}>{meta.label}</span><h3>{item.shortName}<small>（{item.stockCode}）</small></h3><b className={`task-priority is-${priorityTone(item.priority)}`}>{priorityLabel(item.priority)}</b></div>
      <h4>任务描述</h4>
      <p>{item.taskDescription || detailDescription(item)}</p>
      <dl><div><dt>关联赛道</dt><dd>{item.categoryName}</dd></div><div><dt>关系判断</dt><dd>{item.relationType} · {item.confidence}</dd></div><div><dt>最近更新</dt><dd>{formatDateTime(item.updatedAt)}</dd></div></dl>
    </section>
    <section className="task-evidence-list">
      <header><h4>所需证据（{Math.min(item.evidenceCount, target)}/{target}）</h4><button type="button" onClick={onOpen}>查看档案<ArrowRight aria-hidden="true" /></button></header>
      <ul>{requirements.map((requirement) => <li key={requirement.label} className={requirement.done ? "is-done" : ""}><span>{requirement.done ? <CheckCircle2 aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}</span><b>{requirement.label}</b><em>{requirement.done ? "已具备" : "待补充"}</em></li>)}</ul>
    </section>
    <section className="task-next-actions">
      <h4>建议下一步动作</h4>
      <div><button type="button" onClick={onOpen}><ShieldCheck aria-hidden="true" />打开定位<small>{targetLabel(item)}</small></button><button type="button" onClick={onOpen}><FileCheck2 aria-hidden="true" />补充资料<small>添加证据</small></button><button type="button" onClick={onOpen}><FileText aria-hidden="true" />生成报告<small>产出结论</small></button><button type="button" onClick={onOpen}><Archive aria-hidden="true" />完善档案<small>沉淀研究</small></button></div>
    </section>
    <section className="task-resolution-actions">
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" onClick={onOpen}>打开精确位置</button>
      {item.taskType === "sync_failure" ? <button className="is-primary" type="button" disabled={busy} onClick={() => onAction("retry")}>{busy ? "正在重试" : "重新同步"}</button> : null}
      {item.canComplete ? <button className="is-primary" type="button" disabled={busy} onClick={() => onAction("complete")}>{busy ? "正在回写" : item.taskType === "low_confidence" ? "确认已核验" : "确认完成"}</button> : null}
      <button type="button" disabled={busy} onClick={() => onAction("dismiss")}>暂不处理</button>
    </section>
    <section className="task-system-suggestions">
      <header><span><Sparkles aria-hidden="true" />系统建议动作</span><button type="button"><CircleDashed aria-hidden="true" />换一批</button></header>
      <div>{systemSuggestions(item).map((suggestion) => <article key={suggestion.title}><Lightbulb aria-hidden="true" /><b>{suggestion.title}</b><p>{suggestion.description}</p><small>{suggestion.impact}</small></article>)}</div>
    </section>
  </>;
}

export function ResearchQueueDrawer({ open, refreshKey, onClose, onOpenCompany }: { open: boolean; refreshKey: number; onClose: () => void; onOpenCompany: (stockCode: string, categoryId: number | null) => void }) {
  if (!open) return null;
  return <div className="research-queue-drawer" role="presentation"><button className="research-queue-backdrop" type="button" aria-label="关闭任务中心" onClick={onClose} /><aside className="research-queue-drawer-panel" role="dialog" aria-modal="true" aria-label="任务中心"><ResearchQueue compact refreshKey={refreshKey} onClose={onClose} onOpenCompany={onOpenCompany} /></aside></div>;
}

function taskMeta(item: ResearchQueueItem) {
  if (item.reasons.includes("同步失败")) return { label: "同步失败", tone: "red", description: `${item.failedFieldCount} 个字段来源同步失败`, action: "立即重试" };
  if (item.reasons.includes("成果待完善")) return { label: "成果质检", tone: "violet", description: item.taskDescription, action: "修订成果" };
  if (item.reasons.includes("待复核")) return { label: "关系核验", tone: "red", description: "产业链关系与置信度待复核", action: "立即处理" };
  if (item.reasons.includes("资料过期")) return { label: "资料过期", tone: "orange", description: "证据时效性需要重新核验", action: "更新证据" };
  if (item.reasons.includes("待补资料")) return { label: "资料补全", tone: "orange", description: `${item.fieldIssueCount} 个字段待补或待核验`, action: "补全资料" };
  if (item.reasons.includes("缺证据")) return { label: "证据补充", tone: "blue", description: "关键业务与产业位置缺少可追溯证据", action: "补充证据" };
  if (item.reasons.includes("待建档")) return { label: "档案完善", tone: "orange", description: "公司研究档案和业务字段待结构化", action: "完善档案" };
  return { label: "重点跟踪", tone: "violet", description: "重点标的需要持续跟踪与更新", action: "继续研究" };
}

function priorityTone(priority: number) { return priority >= 70 ? "high" : priority >= 30 ? "medium" : "low"; }
function priorityLabel(priority: number) { return priority >= 70 ? "高优" : priority >= 30 ? "中优" : "低优"; }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "待更新" : `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
function detailDescription(item: ResearchQueueItem) { return `核验${item.shortName}与“${item.categoryName}”之间的${item.relationType}关系，补齐可追溯资料并确认当前${item.confidence}置信度判断是否成立。`; }

function targetLabel(item: ResearchQueueItem) {
  if (item.targetType === "field") return `定位到 ${item.fieldKey || "数据字段"}`;
  if (item.targetType === "report") return "定位到研报写作";
  if (item.targetType === "industry") return "定位到产业链图谱";
  if (item.targetType === "relation") return "定位到产业链关系";
  return "定位到公司档案";
}

function emptyQueueStats(): ResearchQueueData["stats"] {
  return { 已关注: 0, 待复核: 0, 缺证据: 0, 资料过期: 0, 待建档: 0, 同步失败: 0, 待补资料: 0, 成果待完善: 0 };
}

function evidenceRequirements(item: ResearchQueueItem) {
  return [
    { label: "公司公告或年报中的业务描述", done: item.evidenceCount >= 1 },
    { label: "细分业务收入、产品或客户占比", done: item.evidenceCount >= 2 },
    { label: "产业链上下游与供需关系佐证", done: item.evidenceCount >= 3 },
    { label: "第三方研报或权威来源交叉验证", done: item.evidenceCount >= 4 },
    { label: "关系结论、边界与置信度说明", done: item.relationType !== "待验证" && item.confidence !== "低" },
  ].slice(0, 1);
}

function systemSuggestions(item: ResearchQueueItem) {
  const suggestions = [];
  if (item.reasons.includes("缺证据")) suggestions.push({ title: "优先补充官方来源", description: "从公告、年报或官网业务资料确认直接关系。", impact: "证据完整度预计提升" });
  if (item.reasons.includes("待复核")) suggestions.push({ title: "核验业务占比与持续性", description: "避免仅凭概念标签形成产业链判断。", impact: "关系置信度预计提升" });
  if (item.reasons.includes("待建档")) suggestions.push({ title: "建立结构化公司档案", description: "沉淀主营业务、产业位置、优势与风险字段。", impact: "后续 AI 研究更快速" });
  return suggestions.slice(0, 3);
}
