import type Database from "better-sqlite3";
import { effectiveEvidenceSql } from "@/lib/research/evidenceTrust";
import { listResearchResults, type ResearchArtifact } from "./researchResults";

export type ResearchDashboardCompany = {
  stockCode: string;
  shortName: string;
  categoryId: number | null;
  categoryName: string;
  relationId: number;
  evidenceCount: number;
  hasResearchProfile: boolean;
  isWatchlist: boolean;
  updatedAt: string;
  isStarterExample: boolean;
};

export type ResearchDashboard = {
  mode: "starter" | "active";
  stats: {
    catalogCompanies: number;
    activeCompanies: number;
    activeCategories: number;
    researchProfiles: number;
    effectiveEvidence: number;
    artifacts: number;
    reports: number;
    aiRuns: number;
    openTasks: number;
    watchlist: number;
  };
  companies: ResearchDashboardCompany[];
  recentArtifacts: ResearchArtifact[];
};

type CountRow = { count: number };

export function getResearchDashboard(db: Database.Database): ResearchDashboard {
  const results = listResearchResults(db);
  const stats = {
    catalogCompanies: count(db, "select count(*) as count from companies"),
    activeCompanies: count(db, `
      select count(distinct relation.stock_code) as count
      from company_category_relations relation
      where ${activeRelationSql("relation")}
    `),
    activeCategories: count(db, `
      select count(distinct relation.category_id) as count
      from company_category_relations relation
      where ${activeRelationSql("relation")}
    `),
    researchProfiles: count(db, "select count(*) as count from company_research_profiles"),
    effectiveEvidence: count(db, `select count(*) as count from evidences evidence where ${effectiveEvidenceSql("evidence")}`),
    artifacts: results.artifacts.filter((artifact) => !artifact.archived).length,
    reports: count(db, `
      select (
        (select count(*) from research_documents)
        + (select count(*) from ai_research_reports)
      ) as count
    `),
    aiRuns: count(db, `
      select (
        (select count(*) from ai_research_runs where status = 'completed')
        + (select count(*) from universal_research_runs where status = 'completed')
      ) as count
    `),
    openTasks: count(db, "select count(*) as count from research_tasks where status in ('open', 'in_progress')"),
    watchlist: count(db, "select count(*) as count from company_category_relations where is_watchlist = 1"),
  };

  const mode = stats.activeCompanies > 0 ? "active" : "starter";
  return {
    mode,
    stats,
    companies: listDashboardCompanies(db, mode === "starter"),
    recentArtifacts: results.artifacts
      .filter((artifact) => !artifact.archived && (artifact.kind === "report" || artifact.kind === "ai"))
      .slice(0, 6),
  };
}

function listDashboardCompanies(db: Database.Database, starter: boolean): ResearchDashboardCompany[] {
  const activeWhere = starter ? "1 = 1" : activeRelationSql("relation");
  const rows = db.prepare(`
    select
      relation.stock_code as stockCode,
      company.short_name as shortName,
      min(relation.category_id) as categoryId,
      min(category.name) as categoryName,
      min(relation.id) as relationId,
      count(distinct evidence.id) as evidenceCount,
      case when profile.stock_code is null then 0 else 1 end as hasResearchProfile,
      max(relation.is_watchlist) as isWatchlist,
      max(
        case
          when profile.updated_at is not null and profile.updated_at > relation.updated_at then profile.updated_at
          else relation.updated_at
        end
      ) as updatedAt
    from company_category_relations relation
    join companies company on company.stock_code = relation.stock_code
    join categories category on category.id = relation.category_id and category.is_active = 1
    left join evidences evidence
      on evidence.relation_id = relation.id
     and (${effectiveEvidenceSql("evidence")})
    left join company_research_profiles profile on profile.stock_code = relation.stock_code
    where ${activeWhere}
    group by relation.stock_code
    order by max(relation.is_watchlist) desc, count(distinct evidence.id) desc, updatedAt desc, relation.stock_code
    limit 8
  `).all() as Array<Omit<ResearchDashboardCompany, "hasResearchProfile" | "isWatchlist" | "isStarterExample"> & {
    hasResearchProfile: number;
    isWatchlist: number;
  }>;

  return rows.map((row) => ({
    ...row,
    evidenceCount: Number(row.evidenceCount),
    hasResearchProfile: row.hasResearchProfile === 1,
    isWatchlist: row.isWatchlist === 1,
    isStarterExample: starter,
  }));
}

function activeRelationSql(alias: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error("关系 SQL 别名无效");
  return `(
    ${alias}.is_watchlist = 1
    or exists (select 1 from evidences active_evidence where active_evidence.relation_id = ${alias}.id)
    or exists (select 1 from company_research_profiles active_profile where active_profile.stock_code = ${alias}.stock_code)
    or exists (select 1 from company_field_facts active_fact where active_fact.stock_code = ${alias}.stock_code)
    or exists (select 1 from sync_tasks active_sync where active_sync.stock_code = ${alias}.stock_code)
    or exists (select 1 from ai_research_runs active_ai where active_ai.stock_code = ${alias}.stock_code)
    or exists (select 1 from ai_research_reports active_ai_report where active_ai_report.stock_code = ${alias}.stock_code)
    or exists (select 1 from research_documents active_report where active_report.stock_code = ${alias}.stock_code)
    or exists (
      select 1 from research_notes active_note
      where (active_note.target_type = 'company' and active_note.target_id = ${alias}.stock_code)
         or (active_note.target_type = 'relation' and active_note.target_id = cast(${alias}.id as text))
    )
  )`;
}

function count(db: Database.Database, sql: string) {
  return Number((db.prepare(sql).get() as CountRow).count);
}
