import type Database from "better-sqlite3";
import type { DeepResearchResult, ResearchReportResult } from "@/lib/agents/deepseekResearchAgent";
import type { ResearchProgressEvent } from "@/lib/research/researchProgress";
import { inferMarketResearchTarget } from "@/lib/research/researchTarget";
import { sanitizePublicFacingPayload, sanitizePublicReportText } from "@/lib/research/publicReportBrand";

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

export type ResearchConversationMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  metadata: {
    result?: DeepResearchResult;
    depth?: string;
    skills?: string[];
    error?: string;
    cancelled?: boolean;
    progressEvents?: ResearchProgressEvent[];
    contextCompressed?: boolean;
  };
  createdAt: string;
};

export type ResearchConversationSession = {
  sessionId: string;
  title: string;
  targetType: "company" | "industry" | "question";
  subjectKey: string;
  subjectLabel: string;
  stockCode: string;
  categoryId: number | null;
  depth: string;
  skills: string[];
  context: Record<string, unknown>;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  integrityStatus?: "ok" | "legacy_target_mismatch";
};

type RunRow = Omit<StoredResearchRun, "result"> & { resultJson: string };

export function saveResearchRun(
  db: Database.Database,
  input: { stockCode: string; categoryId: number | null; question: string; depth: string; result: DeepResearchResult },
) {
  const publicResult = sanitizePublicFacingPayload(input.result);
  const row = db.prepare(
    `insert into ai_research_runs (stock_code, category_id, question, depth, status, model, result_json)
     values (?, ?, ?, ?, 'completed', ?, ?)
     returning id`,
  ).get(input.stockCode, input.categoryId, input.question, input.depth, publicResult.model, JSON.stringify(publicResult)) as { id: number };
  return row.id;
}

export function getLatestResearchRun(db: Database.Database, stockCode: string): StoredResearchRun | null {
  const row = db.prepare(
    `select id, stock_code as stockCode, category_id as categoryId, question, depth, status, model,
            result_json as resultJson, error, created_at as createdAt, updated_at as updatedAt
     from ai_research_runs where stock_code = ? order by id desc limit 1`,
  ).get(stockCode) as RunRow | undefined;
  if (!row) return null;
  return { ...row, result: sanitizePublicFacingPayload(parseJson<DeepResearchResult | null>(row.resultJson, null)) };
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
  const publicResult = sanitizePublicFacingPayload(input.result);
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
    publicResult.model,
    JSON.stringify(publicResult),
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
  return row ? { ...row, result: sanitizePublicFacingPayload(parseJson<DeepResearchResult | null>(row.resultJson, null)) } : null;
}

export function saveResearchReport(
  db: Database.Database,
  input: { stockCode: string; categoryId: number | null; reportType: string; report: ResearchReportResult },
) {
  const report = sanitizePublicFacingPayload(input.report);
  const row = db.prepare(
    `insert into ai_research_reports (stock_code, category_id, report_type, title, executive_summary, content, model)
     values (?, ?, ?, ?, ?, ?, ?)
     returning id`,
  ).get(input.stockCode, input.categoryId, input.reportType, report.title, report.executiveSummary, report.markdown, report.model) as { id: number };
  return row.id;
}

export function getLatestResearchReport(db: Database.Database, stockCode: string): StoredResearchReport | null {
  const row = db.prepare(
    `select id, stock_code as stockCode, category_id as categoryId, report_type as reportType, title,
            executive_summary as executiveSummary, content as markdown, model,
            created_at as createdAt, updated_at as updatedAt
     from ai_research_reports where stock_code = ? order by id desc limit 1`,
  ).get(stockCode) as StoredResearchReport | undefined;
  return row ? sanitizePublicFacingPayload(row) : null;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function upsertResearchSession(
  db: Database.Database,
  input: {
    sessionId: string;
    title: string;
    targetType: "company" | "industry" | "question";
    subjectKey: string;
    subjectLabel: string;
    stockCode: string;
    categoryId: number | null;
    depth: string;
    skills: string[];
    context?: Record<string, unknown>;
  },
) {
  db.prepare(
    `insert into ai_research_sessions (
       session_id, title, target_type, subject_key, subject_label, stock_code, category_id,
       depth, skills_json, context_json
     ) values (?, ?, ?, ?, ?, nullif(?, ''), ?, ?, ?, ?)
     on conflict(session_id) do update set
       title = excluded.title,
       target_type = excluded.target_type,
       subject_key = excluded.subject_key,
       subject_label = excluded.subject_label,
       stock_code = excluded.stock_code,
       category_id = excluded.category_id,
       depth = excluded.depth,
       skills_json = excluded.skills_json,
       context_json = excluded.context_json,
       updated_at = current_timestamp`,
  ).run(
    input.sessionId,
    input.title.slice(0, 80),
    input.targetType,
    input.subjectKey,
    input.subjectLabel,
    input.stockCode,
    input.categoryId,
    input.depth,
    JSON.stringify(input.skills),
    JSON.stringify(input.context ?? {}),
  );
}

export function addResearchMessage(
  db: Database.Database,
  input: {
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    metadata?: ResearchConversationMessage["metadata"];
  },
) {
  const content = input.role === "assistant" ? sanitizePublicReportText(input.content) : input.content;
  const metadata = input.role === "assistant"
    ? sanitizePublicFacingPayload(input.metadata ?? {})
    : input.metadata ?? {};
  const row = db.prepare(
    `insert into ai_research_messages (session_id, role, content, metadata_json)
     values (?, ?, ?, ?) returning id`,
  ).get(input.sessionId, input.role, content, JSON.stringify(metadata)) as { id: number };
  db.prepare("update ai_research_sessions set updated_at = current_timestamp where session_id = ?").run(input.sessionId);
  return row.id;
}

export function listResearchSessions(db: Database.Database, limit = 50): ResearchConversationSession[] {
  const rows = db.prepare(
    `select session.session_id as sessionId, session.title, session.target_type as targetType,
            session.subject_key as subjectKey, session.subject_label as subjectLabel,
            coalesce(session.stock_code, '') as stockCode, session.category_id as categoryId,
            session.depth, session.skills_json as skillsJson, session.context_json as contextJson,
            count(message.id) as messageCount, session.created_at as createdAt,
            session.updated_at as updatedAt
     from ai_research_sessions session
     left join ai_research_messages message on message.session_id = session.session_id
     group by session.session_id
     order by session.updated_at desc
     limit ?`,
  ).all(Math.max(1, Math.min(limit, 100))) as Array<Omit<ResearchConversationSession, "skills" | "context"> & {
    skillsJson: string;
    contextJson: string;
  }>;
  return rows.map(({ skillsJson, contextJson, ...row }) => ({
    ...row,
    skills: parseJson<string[]>(skillsJson, []),
    context: parseJson<Record<string, unknown>>(contextJson, {}),
    integrityStatus: researchSessionIntegrity(row),
  }));
}

export function getResearchSession(db: Database.Database, sessionId: string) {
  const rawSession = db.prepare(
    `select session.session_id as sessionId, session.title, session.target_type as targetType,
            session.subject_key as subjectKey, session.subject_label as subjectLabel,
            coalesce(session.stock_code, '') as stockCode, session.category_id as categoryId,
            session.depth, session.skills_json as skillsJson, session.context_json as contextJson,
            count(message.id) as messageCount, session.created_at as createdAt,
            session.updated_at as updatedAt
     from ai_research_sessions session
     left join ai_research_messages message on message.session_id = session.session_id
     where session.session_id = ?
     group by session.session_id`,
  ).get(sessionId) as (Omit<ResearchConversationSession, "skills" | "context"> & {
    skillsJson: string;
    contextJson: string;
  }) | undefined;
  if (!rawSession) return null;
  const { skillsJson, contextJson, ...sessionFields } = rawSession;
  const session: ResearchConversationSession = {
    ...sessionFields,
    skills: parseJson<string[]>(skillsJson, []),
    context: parseJson<Record<string, unknown>>(contextJson, {}),
    integrityStatus: researchSessionIntegrity(sessionFields),
  };
  const rows = db.prepare(
    `select id, role, content, metadata_json as metadataJson, created_at as createdAt
     from ai_research_messages where session_id = ? order by id asc`,
  ).all(sessionId) as Array<Omit<ResearchConversationMessage, "metadata"> & { metadataJson: string }>;
  return {
    session,
    messages: rows.map(({ metadataJson, ...row }) => row.role === "assistant" ? {
      ...row,
      content: sanitizePublicReportText(row.content),
      metadata: sanitizePublicFacingPayload(parseJson<ResearchConversationMessage["metadata"]>(metadataJson, {})),
    } : {
      ...row,
      metadata: parseJson<ResearchConversationMessage["metadata"]>(metadataJson, {}),
    }),
  };
}

function researchSessionIntegrity(session: Pick<ResearchConversationSession, "title" | "targetType">) {
  return session.targetType === "company" && Boolean(inferMarketResearchTarget(session.title))
    ? "legacy_target_mismatch" as const
    : "ok" as const;
}

export function deleteResearchSession(db: Database.Database, sessionId: string) {
  return db.prepare("delete from ai_research_sessions where session_id = ?").run(sessionId).changes > 0;
}
