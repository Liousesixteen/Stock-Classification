import type Database from "better-sqlite3";
import type {
  ConfidenceLevel,
  GraphEntityRelationType,
  GraphEntityType,
  GraphRelationDirection,
  SourceType,
} from "@/lib/domain/types";
import { effectiveEvidenceSql, type EvidenceVerificationStatus } from "@/lib/research/evidenceTrust";

export type GraphEntityRelationInput = {
  stockCode: string;
  entityType: GraphEntityType;
  entityName: string;
  entitySummary: string;
  relationType: GraphEntityRelationType;
  confidence: ConfidenceLevel;
  rationale: string;
  isWatchlist: boolean;
  direction?: GraphRelationDirection;
  strength?: number;
  observedAt?: string;
  verificationStatus?: "unverified" | "verified";
  evidence: {
    sourceType: SourceType;
    title: string;
    sourceDate: string;
    url: string;
    excerpt: string;
    credibility: ConfidenceLevel;
    verificationStatus?: EvidenceVerificationStatus;
    verifiedAt?: string;
  };
};

export type CompanyGraphEntityRelation = {
  id: number;
  stockCode: string;
  entityId: number;
  entityType: GraphEntityType;
  entityName: string;
  entitySummary: string;
  relationType: GraphEntityRelationType;
  confidence: ConfidenceLevel;
  rationale: string;
  direction: GraphRelationDirection;
  strength: number;
  observedAt: string;
  verificationStatus: "unverified" | "verified";
  verifiedAt: string;
  isWatchlist: boolean;
  evidenceCount: number;
  evidencePreviews: Array<{
    id: number;
    sourceType: SourceType;
    title: string;
    credibility: ConfidenceLevel;
    sourceDate: string;
    url: string;
    excerpt: string;
    verificationStatus: EvidenceVerificationStatus;
    verifiedAt: string;
    isExpired: boolean;
  }>;
  shortName?: string;
  board?: string;
  industry?: string;
  intro?: string;
  mainBusiness?: string;
  updatedAt: string;
};

export type IndustryGraphEntityRelationRow = Omit<CompanyGraphEntityRelation, "id"> & { relationId: number };

export function createCompanyGraphEntityRelation(db: Database.Database, input: GraphEntityRelationInput) {
  return db.transaction(() => {
    const relationMetadata = {
      direction: input.direction ?? "undirected",
      strength: normalizeStrength(input.strength, input.confidence),
      observedAt: input.observedAt?.trim() ?? "",
      directionProvided: input.direction === undefined ? 0 : 1,
      strengthProvided: input.strength === undefined ? 0 : 1,
      observedAtProvided: input.observedAt?.trim() ? 1 : 0,
    };
    db.prepare(
      `
        insert into research_graph_entities (entity_type, name, summary)
        values (@entityType, @entityName, @entitySummary)
        on conflict(entity_type, name) do update set
          summary = case when trim(excluded.summary) = '' then research_graph_entities.summary else excluded.summary end,
          updated_at = current_timestamp
      `,
    ).run(input);
    const entity = db.prepare("select id from research_graph_entities where entity_type = ? and name = ?").get(input.entityType, input.entityName.trim()) as { id: number };
    db.prepare(
      `
        insert into company_graph_entity_relations (
          stock_code, entity_id, relation_type, confidence, rationale, direction, strength, observed_at, is_watchlist
        )
        values (
          @stockCode, @entityId, @relationType, @confidence, @rationale, @direction, @strength, @observedAt, @isWatchlist
        )
        on conflict(stock_code, entity_id) do update set
          verification_status = case
            when company_graph_entity_relations.relation_type != excluded.relation_type
              or company_graph_entity_relations.confidence != excluded.confidence
              or company_graph_entity_relations.rationale != excluded.rationale
              or (@directionProvided = 1 and company_graph_entity_relations.direction != excluded.direction)
              or (@strengthProvided = 1 and company_graph_entity_relations.strength != excluded.strength)
              or (@observedAtProvided = 1 and company_graph_entity_relations.observed_at != excluded.observed_at)
            then 'unverified'
            else company_graph_entity_relations.verification_status
          end,
          verified_at = case
            when company_graph_entity_relations.relation_type != excluded.relation_type
              or company_graph_entity_relations.confidence != excluded.confidence
              or company_graph_entity_relations.rationale != excluded.rationale
              or (@directionProvided = 1 and company_graph_entity_relations.direction != excluded.direction)
              or (@strengthProvided = 1 and company_graph_entity_relations.strength != excluded.strength)
              or (@observedAtProvided = 1 and company_graph_entity_relations.observed_at != excluded.observed_at)
            then ''
            else company_graph_entity_relations.verified_at
          end,
          relation_type = excluded.relation_type,
          confidence = excluded.confidence,
          rationale = excluded.rationale,
          direction = case when @directionProvided = 1 then excluded.direction else company_graph_entity_relations.direction end,
          strength = case when @strengthProvided = 1 then excluded.strength else company_graph_entity_relations.strength end,
          observed_at = case when @observedAtProvided = 1 then excluded.observed_at else company_graph_entity_relations.observed_at end,
          is_watchlist = excluded.is_watchlist,
          updated_at = current_timestamp
      `,
    ).run({ ...input, ...relationMetadata, entityId: entity.id, isWatchlist: input.isWatchlist ? 1 : 0 });
    const relation = db.prepare("select id from company_graph_entity_relations where stock_code = ? and entity_id = ?").get(input.stockCode, entity.id) as { id: number };
    db.prepare(
      `
        insert into company_graph_entity_evidences (
          entity_relation_id, source_type, title, source_date, url, excerpt, credibility,
          verification_status, verified_at
        )
        values (
          @entityRelationId, @sourceType, @title, @sourceDate, @url, @excerpt, @credibility,
          @verificationStatus, @verifiedAt
        )
      `,
    ).run({
      entityRelationId: relation.id,
      ...input.evidence,
      title: input.evidence.title || input.evidence.url || "手动补充证据",
      verificationStatus: input.evidence.verificationStatus ?? "unverified",
      verifiedAt: input.evidence.verifiedAt?.trim() ?? "",
    });
    return getCompanyGraphEntityRelation(db, relation.id)!;
  })();
}

export function listCompanyGraphEntityRelations(db: Database.Database, stockCode: string): CompanyGraphEntityRelation[] {
  const rows = db.prepare(
    `
      select
        r.id, r.stock_code as stockCode, r.entity_id as entityId, entity.entity_type as entityType, entity.name as entityName, entity.summary as entitySummary,
        r.relation_type as relationType, r.confidence, r.rationale, r.direction, r.strength,
        coalesce(nullif(r.observed_at, ''), r.updated_at) as observedAt,
        r.verification_status as verificationStatus, r.verified_at as verifiedAt,
        r.is_watchlist as isWatchlist, r.updated_at as updatedAt,
        count(e.id) as evidenceCount
      from company_graph_entity_relations r
      join research_graph_entities entity on entity.id = r.entity_id and entity.is_active = 1
      left join company_graph_entity_evidences e on e.entity_relation_id = r.id and (${effectiveEvidenceSql("e")})
      where r.stock_code = ?
      group by r.id
      order by r.is_watchlist desc, r.updated_at desc, r.id desc
    `,
  ).all(stockCode) as Array<Omit<CompanyGraphEntityRelation, "isWatchlist" | "evidencePreviews"> & { isWatchlist: number }>;
  return hydrateEvidencePreviews(db, rows);
}

export function listIndustryGraphEntityRelations(db: Database.Database): IndustryGraphEntityRelationRow[] {
  const rows = db.prepare(
    `
      select
        r.id, r.stock_code as stockCode, r.entity_id as entityId, entity.entity_type as entityType, entity.name as entityName, entity.summary as entitySummary,
        company.short_name as shortName, company.board, company.industry, company.intro, company.main_business as mainBusiness,
        r.relation_type as relationType, r.confidence, r.rationale, r.direction, r.strength,
        coalesce(nullif(r.observed_at, ''), r.updated_at) as observedAt,
        r.verification_status as verificationStatus, r.verified_at as verifiedAt,
        r.is_watchlist as isWatchlist, r.updated_at as updatedAt,
        count(e.id) as evidenceCount
      from company_graph_entity_relations r
      join research_graph_entities entity on entity.id = r.entity_id and entity.is_active = 1
      join companies company on company.stock_code = r.stock_code
      left join company_graph_entity_evidences e on e.entity_relation_id = r.id and (${effectiveEvidenceSql("e")})
      group by r.id
      order by r.id
    `,
  ).all() as Array<Omit<CompanyGraphEntityRelation, "isWatchlist" | "evidencePreviews"> & { isWatchlist: number }>;
  return hydrateEvidencePreviews(db, rows).map((relation) => ({ ...relation, relationId: relation.id }));
}

function getCompanyGraphEntityRelation(db: Database.Database, relationId: number) {
  const row = db.prepare(
    `
      select
        r.id, r.stock_code as stockCode, r.entity_id as entityId, entity.entity_type as entityType, entity.name as entityName, entity.summary as entitySummary,
        r.relation_type as relationType, r.confidence, r.rationale, r.direction, r.strength,
        coalesce(nullif(r.observed_at, ''), r.updated_at) as observedAt,
        r.verification_status as verificationStatus, r.verified_at as verifiedAt,
        r.is_watchlist as isWatchlist, r.updated_at as updatedAt,
        count(e.id) as evidenceCount
      from company_graph_entity_relations r
      join research_graph_entities entity on entity.id = r.entity_id
      left join company_graph_entity_evidences e on e.entity_relation_id = r.id and (${effectiveEvidenceSql("e")})
      where r.id = ?
      group by r.id
    `,
  ).get(relationId) as (Omit<CompanyGraphEntityRelation, "isWatchlist" | "evidencePreviews"> & { isWatchlist: number }) | undefined;
  return row ? hydrateEvidencePreviews(db, [row])[0] : null;
}

function hydrateEvidencePreviews(db: Database.Database, rows: Array<Omit<CompanyGraphEntityRelation, "isWatchlist" | "evidencePreviews"> & { isWatchlist: number }>) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(", ");
  const evidenceRows = db.prepare(
    `
      select id, entity_relation_id as relationId, source_type as sourceType, title, credibility,
        source_date as sourceDate, url, excerpt, verification_status as verificationStatus,
        verified_at as verifiedAt, is_expired as isExpired
      from company_graph_entity_evidences
      where (${effectiveEvidenceSql("company_graph_entity_evidences")})
        and entity_relation_id in (${placeholders})
      order by entity_relation_id, source_date desc, id desc
    `,
  ).all(...ids) as Array<{
    id: number;
    relationId: number;
    sourceType: SourceType;
    title: string;
    credibility: ConfidenceLevel;
    sourceDate: string;
    url: string;
    excerpt: string;
    verificationStatus: EvidenceVerificationStatus;
    verifiedAt: string;
    isExpired: number;
  }>;
  const evidenceByRelation = new Map<number, CompanyGraphEntityRelation["evidencePreviews"]>();
  for (const evidence of evidenceRows) {
    const previews = evidenceByRelation.get(evidence.relationId) ?? [];
    if (previews.length < 2) {
      previews.push({
        id: evidence.id,
        sourceType: evidence.sourceType,
        title: evidence.title,
        credibility: evidence.credibility,
        sourceDate: evidence.sourceDate,
        url: evidence.url,
        excerpt: evidence.excerpt,
        verificationStatus: evidence.verificationStatus,
        verifiedAt: evidence.verifiedAt,
        isExpired: Boolean(evidence.isExpired),
      });
    }
    evidenceByRelation.set(evidence.relationId, previews);
  }
  return rows.map((row) => ({ ...row, isWatchlist: row.isWatchlist === 1, evidenceCount: Number(row.evidenceCount), evidencePreviews: evidenceByRelation.get(row.id) ?? [] }));
}

function normalizeStrength(value: number | undefined, confidence: ConfidenceLevel) {
  const fallback = confidence === "高" ? 85 : confidence === "中" ? 65 : 40;
  return Math.max(0, Math.min(100, Math.round(value ?? fallback)));
}
