import type Database from "better-sqlite3";
import { effectiveEvidenceSql } from "@/lib/research/evidenceTrust";

type ExportFormat = "json" | "csv";

export function createWorkspaceExport(db: Database.Database, format: ExportFormat) {
  if (format === "csv") return createRelationCsv(db);
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    formatVersion: 4,
    categories: db.prepare("select * from categories order by level, sort_order, id").all(),
    companies: db.prepare("select * from companies order by stock_code").all(),
    relations: db.prepare("select * from company_category_relations order by id").all(),
    evidences: db.prepare("select * from evidences order by relation_id, id").all(),
    researchProfiles: db.prepare("select * from company_research_profiles order by stock_code").all(),
    syncTasks: db.prepare("select * from sync_tasks order by id").all(),
    companySourceSnapshots: db.prepare("select * from company_source_snapshots order by stock_code, provider").all(),
    companyFieldFacts: db.prepare("select * from company_field_facts order by stock_code, field_key, provider").all(),
    graphEntities: db.prepare("select * from research_graph_entities order by id").all(),
    graphEntityRelations: db.prepare("select * from company_graph_entity_relations order by id").all(),
    graphEntityEvidences: db.prepare("select * from company_graph_entity_evidences order by entity_relation_id, id").all(),
    aiResearchRuns: db.prepare("select * from ai_research_runs order by id").all(),
    aiResearchReports: db.prepare("select * from ai_research_reports order by id").all(),
    universalResearchRuns: db.prepare("select * from universal_research_runs order by id").all(),
    researchDocuments: db.prepare("select * from research_documents order by id").all(),
    researchDocumentVersions: db.prepare("select * from research_document_versions order by report_id, version_number").all(),
    researchTasks: db.prepare("select * from research_tasks order by id").all(),
    researchArtifactStates: db.prepare("select * from research_artifact_states order by artifact_id").all(),
    notes: db.prepare("select * from research_notes order by target_type, target_id, id").all(),
    operationAuditEvents: db.prepare("select * from operation_audit_events order by id").all(),
  }, null, 2);
}

export function createRelationCsv(db: Database.Database) {
  const rows = db.prepare(
    `
      select
        company.stock_code as "股票代码",
        company.short_name as "公司简称",
        category.name as "当前分类",
        r.relation_type as "关系类型",
        r.confidence as "确信度",
        r.rationale as "归类说明",
        r.is_watchlist as "已关注",
        count(e.id) as "有效证据数",
        company.industry as "所属行业",
        company.region as "地区",
        company.market_cap_band as "市值区间",
        company.updated_at as "公司更新时间",
        r.updated_at as "关系更新时间"
      from company_category_relations r
      join companies company on company.stock_code = r.stock_code
      join categories category on category.id = r.category_id
      left join evidences e on e.relation_id = r.id and (${effectiveEvidenceSql("e")})
      group by r.id
      order by category.level, category.sort_order, company.stock_code
    `,
  ).all() as Array<Record<string, unknown>>;
  const headers = ["股票代码", "公司简称", "当前分类", "关系类型", "确信度", "归类说明", "已关注", "有效证据数", "所属行业", "地区", "市值区间", "公司更新时间", "关系更新时间"];
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  const text = safe.replace(/"/g, "\"\"");
  return /[",\n]/.test(text) ? `"${text}"` : text;
}
