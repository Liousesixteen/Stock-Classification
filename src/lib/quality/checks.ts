import type Database from "better-sqlite3";

export type QualityIssue = {
  type: "缺公司简介" | "缺证据" | "低确信度" | "待验证关系" | "缺业务占比" | "缺毛利率" | "缺核心客户";
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

  const structuredProfiles = db
    .prepare(
      `
        select
          stock_code as stockCode,
          business_lines as businessLines,
          key_customers as keyCustomers
        from company_research_profiles
      `,
    )
    .all() as Array<{ stockCode: string; businessLines: string; keyCustomers: string }>;

  for (const profile of structuredProfiles) {
    const businessLines = parseJson<Array<{ name?: string; share?: string; grossMargin?: string }>>(profile.businessLines, []);
    const keyCustomers = parseJson<string[]>(profile.keyCustomers, []);

    if (businessLines.some((line) => isPendingField(line.share, "占比"))) {
      issues.push({
        type: "缺业务占比",
        severity: "medium",
        stockCode: profile.stockCode,
        message: `${profile.stockCode} 缺少业务收入占比`,
      });
    }

    if (businessLines.some((line) => isPendingField(line.grossMargin, "毛利率"))) {
      issues.push({
        type: "缺毛利率",
        severity: "low",
        stockCode: profile.stockCode,
        message: `${profile.stockCode} 缺少业务毛利率`,
      });
    }

    if (keyCustomers.length === 0 || keyCustomers.some((customer) => /待补|未知|暂无/.test(customer))) {
      issues.push({
        type: "缺核心客户",
        severity: "medium",
        stockCode: profile.stockCode,
        message: `${profile.stockCode} 缺少核心客户信息`,
      });
    }
  }

  return issues;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isPendingField(value: string | undefined, keyword: string) {
  return !value || value.trim() === "" || value.includes("待补") || value.includes(keyword.concat("待补"));
}
