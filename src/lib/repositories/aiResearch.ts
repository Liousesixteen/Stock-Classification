import type Database from "better-sqlite3";
import type { DeepResearchResult, ResearchReportResult } from "@/lib/agents/deepseekResearchAgent";

export type StoredResearchRun = {
  id: number;
  stockCode: string;
  categoryId: number | null;
  question: string;
  depth: string;
  status: string;
  model: string;
  result: DeepResearchResult | null;
  error: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredResearchReport = ResearchReportResult & {
  id: number;
  stockCode: string;
  categoryId: number | null;
  reportType: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredUniversalResearchRun = {
  id: number;
  subjectType: "industry" | "question";
  subjectKey: string;
  subjectLabel: string;
  categoryId: number | null;
  question: string;
  depth: string;
  status: string;
  model: string;
  result: DeepResearchResult | null;
  error: string;
  createdAt: string;
  updatedAt: string;
};

type RunRow = Omit<StoredResearchRun, "result"> & { resultJson: string };

export function saveResearchRun(
  db: Database.Database,
  input: { stockCode: string; categoryId: number | null; question: string; depth: string; result: DeepResearchResult },
) {
  const row = db.prepare(
    `insert into ai_research_runs (stock_code, category_id, question, depth, status, model, result_json)
     values (?, ?, ?, ?, 'completed', ?, ?)
     returning id`,
  ).get(input.stockCode, input.categoryId, input.question, input.depth, input.result.model, JSON.stringify(input.result)) as { id: number };
  return row.id;
}

export function getLatestResearchRun(db: Database.Database, stockCode: string): StoredResearchRun | null {
  const row = db.prepare(
    `select id, stock_code as stockCode, category_id as categoryId, question, depth, status, model,
            result_json as resultJson, error, created_at as createdAt, updated_at as updatedAt
     from ai_research_runs where stock_code = ? order by id desc limit 1`,
  ).get(stockCode) as RunRow | undefined;
  if (!row) return null;
  return { ...row, result: parseJson<DeepResearchResult | null>(row.resultJson, null) };
}

export function saveUniversalResearchRun(
  db: Database.Database,
  input: {
    subjectType: "industry" | "question";
    subjectKey: string;
    subjectLabel: string;
    categoryId: number | null;
    question: string;
    depth: string;
    result: DeepResearchResult;
  },
) {
  const row = db.prepare(
    `insert into universal_research_runs (
       subject_type, subject_key, subject_label, category_id, question, depth, status, model, result_json
     ) values (?, ?, ?, ?, ?, ?, 'completed', ?, ?)
     returning id`,
  ).get(
    input.subjectType,
    input.subjectKey,
    input.subjectLabel,
    input.categoryId,
    input.question,
    input.depth,
    input.result.model,
    JSON.stringify(input.result),
  ) as { id: number };
  return row.id;
}

export function getLatestUniversalResearchRun(
  db: Database.Database,
  subjectType: "industry" | "question",
  subjectKey: string,
): StoredUniversalResearchRun | null {
  const row = db.prepare(
    `select id, subject_type as subjectType, subject_key as subjectKey, subject_label as subjectLabel,
            category_id as categoryId, question, depth, status, model, result_json as resultJson,
            error, created_at as createdAt, updated_at as updatedAt
     from universal_research_runs
     where subject_type = ? and subject_key = ?
     order by id desc limit 1`,
  ).get(subjectType, subjectKey) as (Omit<StoredUniversalResearchRun, "result"> & { resultJson: string }) | undefined;
  return row ? { ...row, result: parseJson<DeepResearchResult | null>(row.resultJson, null) } : null;
}

export function saveResearchReport(
  db: Database.Database,
  input: { stockCode: string; categoryId: number | null; reportType: string; report: ResearchReportResult },
) {
  const row = db.prepare(
    `insert into ai_research_reports (stock_code, category_id, report_type, title, executive_summary, content, model)
     values (?, ?, ?, ?, ?, ?, ?)
     returning id`,
  ).get(input.stockCode, input.categoryId, input.reportType, input.report.title, input.report.executiveSummary, input.report.markdown, input.report.model) as { id: number };
  return row.id;
}

export function getLatestResearchReport(db: Database.Database, stockCode: string): StoredResearchReport | null {
  const row = db.prepare(
    `select id, stock_code as stockCode, category_id as categoryId, report_type as reportType, title,
            executive_summary as executiveSummary, content as markdown, model,
            created_at as createdAt, updated_at as updatedAt
     from ai_research_reports where stock_code = ? order by id desc limit 1`,
  ).get(stockCode) as StoredResearchReport | undefined;
  return row ?? null;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
