import type Database from "better-sqlite3";
import type { ConfidenceLevel, RelationType } from "@/lib/domain/types";

export type RelationInput = {
  stockCode: string;
  categoryId: number;
  relationType: RelationType;
  confidence: ConfidenceLevel;
  rationale: string;
  isWatchlist: boolean;
};

type RelationIdRow = {
  id: number;
};

export function upsertRelation(db: Database.Database, relation: RelationInput) {
  db.prepare(
    `
      insert into company_category_relations (
        stock_code,
        category_id,
        relation_type,
        confidence,
        rationale,
        is_watchlist
      )
      values (
        @stockCode,
        @categoryId,
        @relationType,
        @confidence,
        @rationale,
        @isWatchlist
      )
      on conflict(stock_code, category_id) do update set
        relation_type = excluded.relation_type,
        confidence = excluded.confidence,
        rationale = excluded.rationale,
        is_watchlist = excluded.is_watchlist,
        updated_at = current_timestamp
    `,
  ).run({ ...relation, isWatchlist: relation.isWatchlist ? 1 : 0 });

  const row = db
    .prepare(
      `
        select id
        from company_category_relations
        where stock_code = ? and category_id = ?
      `,
    )
    .get(relation.stockCode, relation.categoryId) as RelationIdRow;

  return row.id;
}

export function listRelationsForCategory(db: Database.Database, categoryId: number) {
  return db
    .prepare(
      `
        select
          r.id,
          r.stock_code as stockCode,
          c.short_name as shortName,
          c.intro,
          r.category_id as categoryId,
          r.relation_type as relationType,
          r.confidence,
          r.rationale,
          e.source_type as sourceType,
          e.title as sourceTitle
        from company_category_relations r
        join companies c on c.stock_code = r.stock_code
        left join evidences e on e.id = r.primary_evidence_id
        where r.category_id = ?
        order by
          case r.relation_type
            when '主营业务' then 0
            when '重要相关' then 1
            when '概念/少量布局' then 2
            when '待验证' then 3
            else 4
          end,
          r.stock_code
      `,
    )
    .all(categoryId) as {
    id: number;
    stockCode: string;
    shortName: string;
    intro: string;
    categoryId: number;
    relationType: RelationType;
    confidence: ConfidenceLevel;
    rationale: string;
    sourceType: string | null;
    sourceTitle: string | null;
  }[];
}

export function listRelationsForCompany(db: Database.Database, stockCode: string) {
  const rows = db
    .prepare(
      `
        select
          r.id,
          r.stock_code as stockCode,
          r.category_id as categoryId,
          cat.name as categoryName,
          r.relation_type as relationType,
          r.confidence,
          r.rationale,
          r.primary_evidence_id as primaryEvidenceId,
          r.is_watchlist as isWatchlist,
          r.created_at as createdAt,
          r.updated_at as updatedAt
        from company_category_relations r
        join categories cat on cat.id = r.category_id
        where r.stock_code = ?
        order by cat.level, cat.sort_order, cat.id
      `,
    )
    .all(stockCode) as {
    id: number;
    stockCode: string;
    categoryId: number;
    categoryName: string;
    relationType: RelationType;
    confidence: ConfidenceLevel;
    rationale: string;
    primaryEvidenceId: number | null;
    isWatchlist: number;
    createdAt: string;
    updatedAt: string;
  }[];

  return rows.map((row) => ({ ...row, isWatchlist: row.isWatchlist === 1 }));
}
