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

export function updateCompanyProfile(db: Database.Database, company: Company) {
  const result = db
    .prepare(
      `
        update companies
        set short_name = @shortName,
            full_name = @fullName,
            board = @board,
            industry = @industry,
            region = @region,
            market_cap_band = @marketCapBand,
            intro = @intro,
            main_business = @mainBusiness,
            updated_at = current_timestamp
        where stock_code = @stockCode
      `,
    )
    .run(company);

  if (result.changes === 0) {
    throw new Error("公司不存在");
  }
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

export function findStoredCompanyQuery(db: Database.Database, value: string) {
  const query = value.trim().replace(/\s+/g, "");
  if (!query) return undefined;
  const row = db.prepare(
    `
      select stock_code, short_name, full_name, board, industry, region, market_cap_band, intro, main_business, updated_at
      from companies
      where stock_code = ? or short_name = ? or (full_name <> '' and full_name = ?)
      order by case when stock_code = ? then 0 when short_name = ? then 1 else 2 end
      limit 1
    `,
  ).get(query, query, query, query, query) as CompanyRow | undefined;
  return row ? mapRow(row) : undefined;
}

export function findStoredCompanyMention(db: Database.Database, value: string) {
  const text = value.trim().replace(/\s+/g, "");
  if (!text) return undefined;
  const rows = db.prepare(
    `
      select stock_code, short_name, full_name, board, industry, region, market_cap_band, intro, main_business, updated_at
      from companies
      where (length(short_name) >= 2 and instr(?, short_name) > 0)
         or (length(full_name) >= 4 and instr(?, full_name) > 0)
      order by max(length(short_name), length(full_name)) desc, stock_code asc
      limit 2
    `,
  ).all(text, text) as CompanyRow[];
  if (!rows[0]) return undefined;
  const firstLength = Math.max(rows[0].short_name.length, rows[0].full_name.length);
  const secondLength = rows[1] ? Math.max(rows[1].short_name.length, rows[1].full_name.length) : -1;
  if (rows[1] && firstLength === secondLength && rows[0].stock_code !== rows[1].stock_code) return undefined;
  return mapRow(rows[0]);
}
