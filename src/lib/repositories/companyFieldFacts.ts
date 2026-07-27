import type Database from "better-sqlite3";

export type CompanyFieldFactStatus = "available" | "missing" | "failed" | "skipped";
export type CompanyFieldVerificationStatus = "unverified" | "verified" | "conflicted" | "rejected";
export type CompanyFieldConfidence = "high" | "medium" | "low";

export type CompanyFieldFactInput = {
  stockCode: string;
  fieldKey: string;
  provider: string;
  providerLabel: string;
  value?: unknown;
  status: CompanyFieldFactStatus;
  sourceUrl?: string;
  confidence: CompanyFieldConfidence;
  verificationStatus?: CompanyFieldVerificationStatus;
  error?: string;
  fetchedAt?: string;
};

export type CompanyFieldFact = {
  stockCode: string;
  fieldKey: string;
  provider: string;
  providerLabel: string;
  value: unknown;
  status: CompanyFieldFactStatus;
  sourceUrl: string;
  confidence: CompanyFieldConfidence;
  verificationStatus: CompanyFieldVerificationStatus;
  error: string;
  fetchedAt: string;
  createdAt: string;
  updatedAt: string;
};

type CompanyFieldFactRow = Omit<CompanyFieldFact, "value"> & { valueJson: string };

export function upsertCompanyFieldFact(db: Database.Database, fact: CompanyFieldFactInput) {
  db.prepare(
    `
      insert into company_field_facts (
        stock_code,
        field_key,
        provider,
        provider_label,
        value_json,
        status,
        source_url,
        confidence,
        verification_status,
        error,
        fetched_at
      )
      values (
        @stockCode,
        @fieldKey,
        @provider,
        @providerLabel,
        @valueJson,
        @status,
        @sourceUrl,
        @confidence,
        @verificationStatus,
        @error,
        coalesce(nullif(@fetchedAt, ''), current_timestamp)
      )
      on conflict(stock_code, field_key, provider) do update set
        provider_label = excluded.provider_label,
        value_json = excluded.value_json,
        status = excluded.status,
        source_url = excluded.source_url,
        confidence = excluded.confidence,
        verification_status = case
          when company_field_facts.value_json = excluded.value_json
            and company_field_facts.source_url = excluded.source_url
            and company_field_facts.status = excluded.status
          then company_field_facts.verification_status
          else excluded.verification_status
        end,
        error = excluded.error,
        fetched_at = excluded.fetched_at,
        updated_at = current_timestamp
    `,
  ).run({
    stockCode: fact.stockCode,
    fieldKey: fact.fieldKey,
    provider: fact.provider,
    providerLabel: fact.providerLabel,
    valueJson: JSON.stringify(fact.value ?? null),
    status: fact.status,
    sourceUrl: fact.sourceUrl ?? "",
    confidence: fact.confidence,
    verificationStatus: fact.verificationStatus ?? "unverified",
    error: fact.error ?? "",
    fetchedAt: fact.fetchedAt ?? "",
  });
}

export function listCompanyFieldFacts(db: Database.Database, stockCode: string) {
  const rows = db
    .prepare(
      `
        select
          stock_code as stockCode,
          field_key as fieldKey,
          provider,
          provider_label as providerLabel,
          value_json as valueJson,
          status,
          source_url as sourceUrl,
          confidence,
          verification_status as verificationStatus,
          error,
          fetched_at as fetchedAt,
          created_at as createdAt,
          updated_at as updatedAt
        from company_field_facts
        where stock_code = ?
        order by field_key asc, confidence asc, provider asc
      `,
    )
    .all(stockCode) as CompanyFieldFactRow[];

  return rows.map(mapCompanyFieldFact);
}

export function setCompanyFieldVerificationStatus(
  db: Database.Database,
  input: {
    stockCode: string;
    fieldKey: string;
    provider: string;
    verificationStatus: CompanyFieldVerificationStatus;
  },
) {
  db.prepare(
    `
      update company_field_facts
      set verification_status = @verificationStatus,
          updated_at = current_timestamp
      where stock_code = @stockCode
        and field_key = @fieldKey
        and provider = @provider
    `,
  ).run(input);
}

function mapCompanyFieldFact(row: CompanyFieldFactRow): CompanyFieldFact {
  return {
    ...row,
    value: parseValue(row.valueJson),
  };
}

function parseValue(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
