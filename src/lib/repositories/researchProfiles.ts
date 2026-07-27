import type Database from "better-sqlite3";

export type BusinessLine = {
  name: string;
  share: string;
  grossMargin: string;
};

export type CompanyResearchProfileInput = {
  stockCode: string;
  summary: string;
  businessLines: BusinessLine[];
  chainPosition: string[];
  competitiveAdvantages: string[];
  keyCustomers: string[];
  catalysts: string[];
  risks: string[];
  sourceSummary: string;
};

export type CompanyResearchProfile = CompanyResearchProfileInput & {
  createdAt: string;
  updatedAt: string;
};

type ResearchProfileRow = {
  stockCode: string;
  summary: string;
  businessLines: string;
  chainPosition: string;
  competitiveAdvantages: string;
  keyCustomers: string;
  catalysts: string;
  risks: string;
  sourceSummary: string;
  createdAt: string;
  updatedAt: string;
};

export function upsertCompanyResearchProfile(db: Database.Database, profile: CompanyResearchProfileInput) {
  db.prepare(
    `
      insert into company_research_profiles (
        stock_code,
        summary,
        business_lines,
        chain_position,
        competitive_advantages,
        key_customers,
        catalysts,
        risks,
        source_summary
      )
      values (
        @stockCode,
        @summary,
        @businessLines,
        @chainPosition,
        @competitiveAdvantages,
        @keyCustomers,
        @catalysts,
        @risks,
        @sourceSummary
      )
      on conflict(stock_code) do update set
        summary = excluded.summary,
        business_lines = excluded.business_lines,
        chain_position = excluded.chain_position,
        competitive_advantages = excluded.competitive_advantages,
        key_customers = excluded.key_customers,
        catalysts = excluded.catalysts,
        risks = excluded.risks,
        source_summary = excluded.source_summary,
        updated_at = current_timestamp
    `,
  ).run(serializeInput(profile));
}

export function getCompanyResearchProfile(db: Database.Database, stockCode: string): CompanyResearchProfile | null {
  const row = db
    .prepare(
      `
        select
          stock_code as stockCode,
          summary,
          business_lines as businessLines,
          chain_position as chainPosition,
          competitive_advantages as competitiveAdvantages,
          key_customers as keyCustomers,
          catalysts,
          risks,
          source_summary as sourceSummary,
          created_at as createdAt,
          updated_at as updatedAt
        from company_research_profiles
        where stock_code = ?
      `,
    )
    .get(stockCode) as ResearchProfileRow | undefined;

  return row ? deserializeRow(row) : null;
}

function serializeInput(profile: CompanyResearchProfileInput) {
  return {
    stockCode: profile.stockCode,
    summary: profile.summary.trim(),
    businessLines: JSON.stringify(profile.businessLines),
    chainPosition: JSON.stringify(profile.chainPosition),
    competitiveAdvantages: JSON.stringify(profile.competitiveAdvantages),
    keyCustomers: JSON.stringify(profile.keyCustomers),
    catalysts: JSON.stringify(profile.catalysts),
    risks: JSON.stringify(profile.risks),
    sourceSummary: profile.sourceSummary.trim(),
  };
}

function deserializeRow(row: ResearchProfileRow): CompanyResearchProfile {
  return {
    stockCode: row.stockCode,
    summary: row.summary,
    businessLines: parseJson<BusinessLine[]>(row.businessLines, []),
    chainPosition: parseJson<string[]>(row.chainPosition, []),
    competitiveAdvantages: parseJson<string[]>(row.competitiveAdvantages, []),
    keyCustomers: parseJson<string[]>(row.keyCustomers, []),
    catalysts: parseJson<string[]>(row.catalysts, []),
    risks: parseJson<string[]>(row.risks, []),
    sourceSummary: row.sourceSummary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
