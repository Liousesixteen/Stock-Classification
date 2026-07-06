import type Database from "better-sqlite3";

export type QualityIssue = {
  type: "缺公司简介" | "缺证据" | "低确信度" | "待验证关系";
  severity: "high" | "medium" | "low";
  stockCode?: string;
  relationId?: number;
  message: string;
};

export function runQualityChecks(db: Database.Database): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const missingIntro = db.prepare("select stock_code, short_name from companies where trim(intro) = ''").all() as Array<{
    stock_code: string;
    short_name: string;
  }>;
  for (const row of missingIntro) {
    issues.push({
      type: "缺公司简介",
      severity: "medium",
      stockCode: row.stock_code,
      message: `${row.short_name} 缺少公司简介`,
    });
  }

  const missingEvidence = db
    .prepare(
      `
        select r.id, r.stock_code
        from company_category_relations r
        left join evidences e on e.relation_id = r.id
        where e.id is null
      `,
    )
    .all() as Array<{ id: number; stock_code: string }>;
  for (const row of missingEvidence) {
    issues.push({
      type: "缺证据",
      severity: "high",
      stockCode: row.stock_code,
      relationId: row.id,
      message: `关系 ${row.id} 缺少证据来源`,
    });
  }

  const lowConfidence = db
    .prepare("select id, stock_code from company_category_relations where confidence = '低'")
    .all() as Array<{ id: number; stock_code: string }>;
  for (const row of lowConfidence) {
    issues.push({
      type: "低确信度",
      severity: "low",
      stockCode: row.stock_code,
      relationId: row.id,
      message: `关系 ${row.id} 为低确信度`,
    });
  }

  const watchlist = db
    .prepare("select id, stock_code from company_category_relations where is_watchlist = 1 or relation_type = '待验证'")
    .all() as Array<{ id: number; stock_code: string }>;
  for (const row of watchlist) {
    issues.push({
      type: "待验证关系",
      severity: "medium",
      stockCode: row.stock_code,
      relationId: row.id,
      message: `关系 ${row.id} 需要复核`,
    });
  }

  return issues;
}
