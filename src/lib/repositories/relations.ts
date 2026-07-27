import type Database from "better-sqlite3";
import type { ConfidenceLevel, GraphRelationDirection, RelationType, SourceType } from "@/lib/domain/types";

export type RelationInput = {
  stockCode: string;
  categoryId: number;
  relationType: RelationType;
  confidence: ConfidenceLevel;
  rationale: string;
  isWatchlist: boolean;
  direction?: GraphRelationDirection;
  strength?: number;
  observedAt?: string;
};

type RelationIdRow = {
  id: number;
};

type CategoryRelationRow = {
  id: number;
  stockCode: string;
  shortName: string;
  intro: string;
  categoryId: number;
  relationType: RelationType;
  confidence: ConfidenceLevel;
  rationale: string;
  direction: GraphRelationDirection;
  strength: number;
  observedAt: string;
  verificationStatus: "unverified" | "verified";
  verifiedAt: string;
  isWatchlist: number;
  sourceType: SourceType | null;
  sourceTitle: string | null;
};

export function upsertRelation(db: Database.Database, relation: RelationInput) {
  const relationWithMetadata = {
    ...relation,
    direction: relation.direction ?? "undirected",
    strength: normalizeStrength(relation.strength, relation.confidence),
    observedAt: relation.observedAt?.trim() ?? "",
    directionProvided: relation.direction === undefined ? 0 : 1,
    strengthProvided: relation.strength === undefined ? 0 : 1,
    observedAtProvided: relation.observedAt?.trim() ? 1 : 0,
  };
  db.prepare(
    `
      insert into company_category_relations (
        stock_code,
        category_id,
        relation_type,
        confidence,
        rationale,
        direction,
        strength,
        observed_at,
        is_watchlist
      )
      values (
        @stockCode,
        @categoryId,
        @relationType,
        @confidence,
        @rationale,
        @direction,
        @strength,
        @observedAt,
        @isWatchlist
      )
      on conflict(stock_code, category_id) do update set
        verification_status = case
          when company_category_relations.relation_type != excluded.relation_type
            or company_category_relations.confidence != excluded.confidence
            or company_category_relations.rationale != excluded.rationale
            or (@directionProvided = 1 and company_category_relations.direction != excluded.direction)
            or (@strengthProvided = 1 and company_category_relations.strength != excluded.strength)
            or (@observedAtProvided = 1 and company_category_relations.observed_at != excluded.observed_at)
          then 'unverified'
          else company_category_relations.verification_status
        end,
        verified_at = case
          when company_category_relations.relation_type != excluded.relation_type
            or company_category_relations.confidence != excluded.confidence
            or company_category_relations.rationale != excluded.rationale
            or (@directionProvided = 1 and company_category_relations.direction != excluded.direction)
            or (@strengthProvided = 1 and company_category_relations.strength != excluded.strength)
            or (@observedAtProvided = 1 and company_category_relations.observed_at != excluded.observed_at)
          then ''
          else company_category_relations.verified_at
        end,
        relation_type = excluded.relation_type,
        confidence = excluded.confidence,
        rationale = excluded.rationale,
        direction = case when @directionProvided = 1 then excluded.direction else company_category_relations.direction end,
        strength = case when @strengthProvided = 1 then excluded.strength else company_category_relations.strength end,
        observed_at = case when @observedAtProvided = 1 then excluded.observed_at else company_category_relations.observed_at end,
        is_watchlist = excluded.is_watchlist,
        updated_at = current_timestamp
    `,
  ).run({ ...relationWithMetadata, isWatchlist: relation.isWatchlist ? 1 : 0 });

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

export function deleteRelation(db: Database.Database, relationId: number) {
  const result = db.prepare("delete from company_category_relations where id = ?").run(relationId);
  return result.changes;
}

export function setRelationWatchlist(db: Database.Database, relationId: number, isWatchlist: boolean) {
  const result = db
    .prepare(
      `
        update company_category_relations
        set is_watchlist = ?, updated_at = current_timestamp
        where id = ?
      `,
    )
    .run(isWatchlist ? 1 : 0, relationId);
  return result.changes;
}

export function setPrimaryEvidenceForRelation(db: Database.Database, relationId: number, evidenceId: number) {
  db.prepare(
    `
      update company_category_relations
      set primary_evidence_id = ?,
          updated_at = current_timestamp
      where id = ?
    `,
  ).run(evidenceId, relationId);
}

export function listRelationsForCategory(db: Database.Database, categoryId: number) {
  const rows = db
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
          r.direction,
          r.strength,
          coalesce(nullif(r.observed_at, ''), r.updated_at) as observedAt,
          r.verification_status as verificationStatus,
          r.verified_at as verifiedAt,
          r.is_watchlist as isWatchlist,
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
    .all(categoryId) as CategoryRelationRow[];

  return rows.map((row) => ({ ...row, isWatchlist: row.isWatchlist === 1 }));
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
          r.direction,
          r.strength,
          coalesce(nullif(r.observed_at, ''), r.updated_at) as observedAt,
          r.verification_status as verificationStatus,
          r.verified_at as verifiedAt,
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
    direction: GraphRelationDirection;
    strength: number;
    observedAt: string;
    verificationStatus: "unverified" | "verified";
    verifiedAt: string;
    primaryEvidenceId: number | null;
    isWatchlist: number;
    createdAt: string;
    updatedAt: string;
  }[];

  return rows.map((row) => ({ ...row, isWatchlist: row.isWatchlist === 1 }));
}

function normalizeStrength(value: number | undefined, confidence: ConfidenceLevel) {
  const fallback = confidence === "高" ? 85 : confidence === "中" ? 65 : 40;
  return Math.max(0, Math.min(100, Math.round(value ?? fallback)));
}
