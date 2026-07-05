import type Database from "better-sqlite3";
import type { Company } from "@/lib/domain/types";

type CompanyRow = {
  stock_code: string;
  short_name: string;
  full_name: string;
  board: string;
  industry: string;
  region: string;
  market_cap_band: string;
  intro: string;
  main_business: string;
  updated_at: string;
};

function mapRow(row: CompanyRow): Company {
  return {
    stockCode: row.stock_code,
    shortName: row.short_name,
    fullName: row.full_name,
    board: row.board,
    industry: row.industry,
    region: row.region,
    marketCapBand: row.market_cap_band,
    intro: row.intro,
    mainBusiness: row.main_business,
    updatedAt: row.updated_at,
  };
}

export function upsertCompany(db: Database.Database, company: Company) {
  db.prepare(
    `
      insert into companies (
        stock_code,
        short_name,
        full_name,
        board,
        industry,
        region,
        market_cap_band,
        intro,
        main_business,
        updated_at
      )
      values (
        @stockCode,
        @shortName,
        @fullName,
        @board,
        @industry,
        @region,
        @marketCapBand,
        @intro,
        @mainBusiness,
        case when @updatedAt = '' then current_timestamp else @updatedAt end
      )
      on conflict(stock_code) do update set
        short_name = excluded.short_name,
        full_name = excluded.full_name,
        board = excluded.board,
        industry = excluded.industry,
        region = excluded.region,
        market_cap_band = excluded.market_cap_band,
        intro = case when excluded.intro = '' then companies.intro else excluded.intro end,
        main_business = case
          when excluded.main_business = '' then companies.main_business
          else excluded.main_business
        end,
        updated_at = current_timestamp
    `,
  ).run(company);
}

export function getCompany(db: Database.Database, stockCode: string) {
  const row = db
    .prepare(
      `
        select stock_code, short_name, full_name, board, industry, region, market_cap_band, intro, main_business, updated_at
        from companies
        where stock_code = ?
      `,
    )
    .get(stockCode) as CompanyRow | undefined;

  return row ? mapRow(row) : undefined;
}
