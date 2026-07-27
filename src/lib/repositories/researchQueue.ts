import type Database from "better-sqlite3";
import {
  listResearchTasks,
  type ResearchTaskStatus,
  type ResearchTaskTargetType,
  type ResearchTaskType,
} from "./researchTasks";

export type ResearchQueueReason =
  | "已关注"
  | "待复核"
  | "缺证据"
  | "资料过期"
  | "待建档"
  | "同步失败"
  | "待补资料"
  | "成果待完善";

export type ResearchQueueItem = {
  taskId: number;
  taskType: ResearchTaskType;
  taskStatus: ResearchTaskStatus;
  taskTitle: string;
  taskDescription: string;
  targetType: ResearchTaskTargetType;
  sourceRef: string;
  fieldKey: string;
  evidenceId: number | null;
  reportId: number | null;
  canComplete: boolean;
  relationId: number;
  stockCode: string;
  shortName: string;
  categoryId: number | null;
  categoryName: string;
  relationType: string;
  confidence: string;
  evidenceCount: number;
  fieldIssueCount: number;
  failedFieldCount: number;
  hasResearchProfile: boolean;
  isWatchlist: boolean;
  updatedAt: string;
  reasons: ResearchQueueReason[];
  priority: number;
};

export type ResearchQueue = {
  items: ResearchQueueItem[];
  stats: Record<ResearchQueueReason, number>;
};

export function getResearchQueue(db: Database.Database): ResearchQueue {
  const tasks = listResearchTasks(db);
  const companyMeta = new Map<string, {
    fieldIssueCount: number;
    failedFieldCount: number;
    hasResearchProfile: boolean;
  }>();
  const metaRows = db.prepare(`
    select
      company.stock_code as stockCode,
      sum(case when fact.status in ('missing', 'failed') then 1 else 0 end) as fieldIssueCount,
      sum(case when fact.status = 'failed' then 1 else 0 end) as failedFieldCount,
      case when profile.stock_code is null then 0 else 1 end as hasResearchProfile
    from companies company
    left join company_field_facts fact on fact.stock_code = company.stock_code
    left join company_research_profiles profile on profile.stock_code = company.stock_code
    group by company.stock_code
  `).all() as Array<{
    stockCode: string;
    fieldIssueCount: number;
    failedFieldCount: number;
    hasResearchProfile: number;
  }>;
  for (const row of metaRows) {
    companyMeta.set(row.stockCode, {
      fieldIssueCount: Number(row.fieldIssueCount),
      failedFieldCount: Number(row.failedFieldCount),
      hasResearchProfile: row.hasResearchProfile === 1,
    });
  }

  const watchlistRelations = new Set(
    (db.prepare("select id from company_category_relations where is_watchlist = 1").all() as Array<{ id: number }>)
      .map((row) => row.id),
  );

  const items = tasks.map((task): ResearchQueueItem => {
    const meta = companyMeta.get(task.stockCode);
    const isWatchlist = task.relationId ? watchlistRelations.has(task.relationId) : false;
    const reasons: ResearchQueueReason[] = [reasonForTask(task.taskType)];
    if (isWatchlist) reasons.unshift("已关注");
    return {
      taskId: task.id,
      taskType: task.taskType,
      taskStatus: task.status,
      taskTitle: task.title,
      taskDescription: task.description,
      targetType: task.targetType,
      sourceRef: task.sourceRef,
      fieldKey: task.fieldKey,
      evidenceId: task.evidenceId,
      reportId: task.reportId,
      canComplete: task.canComplete,
      relationId: task.relationId ?? 0,
      stockCode: task.stockCode,
      shortName: task.shortName || task.categoryName || "研究任务",
      categoryId: task.categoryId,
      categoryName: task.categoryName || "跨赛道研究",
      relationType: task.relationType || targetLabel(task.targetType),
      confidence: task.confidence || (task.taskType === "low_confidence" ? "低" : "中"),
      evidenceCount: task.evidenceCount,
      fieldIssueCount: meta?.fieldIssueCount ?? (task.taskType === "missing_field" ? 1 : 0),
      failedFieldCount: meta?.failedFieldCount ?? (task.taskType === "sync_failure" ? 1 : 0),
      hasResearchProfile: meta?.hasResearchProfile ?? false,
      isWatchlist,
      updatedAt: task.updatedAt,
      reasons,
      priority: task.priority + (isWatchlist ? 20 : 0),
    };
  }).sort((left, right) =>
    right.priority - left.priority
    || right.updatedAt.localeCompare(left.updatedAt)
    || left.taskId - right.taskId,
  );

  const stats = emptyStats();
  const countedWatchlistRelations = new Set<number>();
  for (const item of items) {
    for (const reason of item.reasons) {
      if (reason === "已关注") {
        if (countedWatchlistRelations.has(item.relationId)) continue;
        countedWatchlistRelations.add(item.relationId);
      }
      stats[reason] += 1;
    }
  }
  return { items, stats };
}

function emptyStats(): Record<ResearchQueueReason, number> {
  return {
    已关注: 0,
    待复核: 0,
    缺证据: 0,
    资料过期: 0,
    待建档: 0,
    同步失败: 0,
    待补资料: 0,
    成果待完善: 0,
  };
}

function reasonForTask(taskType: ResearchTaskType): ResearchQueueReason {
  if (taskType === "missing_evidence") return "缺证据";
  if (taskType === "stale_evidence") return "资料过期";
  if (taskType === "low_confidence") return "待复核";
  if (taskType === "missing_profile") return "待建档";
  if (taskType === "missing_field") return "待补资料";
  if (taskType === "sync_failure") return "同步失败";
  return "成果待完善";
}

function targetLabel(targetType: ResearchTaskTargetType) {
  if (targetType === "field") return "字段资料";
  if (targetType === "report") return "研究报告";
  if (targetType === "industry") return "赛道研究";
  if (targetType === "relation") return "产业链关系";
  if (targetType === "evidence") return "来源证据";
  return "公司档案";
}
