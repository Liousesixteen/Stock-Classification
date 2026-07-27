import type Database from "better-sqlite3";
import type { IndustryGraphEvidencePreview, IndustryGraphRelationRow } from "@/lib/industry-graph/types";
import { effectiveEvidenceSql } from "@/lib/research/evidenceTrust";

type RelationRow = Omit<IndustryGraphRelationRow, "evidencePreviews" | "isWatchlist" | "relationId"> & { relationId: number; isWatchlist: number };

export function listIndustryGraphRelations(db: Database.Database): IndustryGraphRelationRow[] {
  const relations = db
    .prepare(
      `
        select
          r.id as relationId,
          r.category_id as categoryId,
          r.stock_code as stockCode,
          c.short_name as shortName,
          c.board,
          c.industry,
          c.intro,
          c.main_business as mainBusiness,
          r.relation_type as relationType,
          r.confidence,
          r.rationale,
          r.direction,
          r.strength,
          coalesce(nullif(r.observed_at, ''), r.updated_at) as observedAt,
          r.verification_status as verificationStatus,
          r.is_watchlist as isWatchlist,
          count(e.id) as evidenceCount
        from company_category_relations r
        join companies c on c.stock_code = r.stock_code
        join categories category on category.id = r.category_id and category.is_active = 1
        left join evidences e on e.relation_id = r.id and (${effectiveEvidenceSql("e")})
        group by r.id
        order by r.category_id, r.stock_code
      `,
    )
    .all() as RelationRow[];
  const relationIds = relations.map((relation) => relation.relationId);
  const evidenceByRelationId = new Map<number, IndustryGraphEvidencePreview[]>();

  if (relationIds.length > 0) {
    const placeholders = relationIds.map(() => "?").join(", ");
    const evidenceRows = db.prepare(
      `
        select
          id,
          relation_id as relationId,
          source_type as sourceType,
          title,
          credibility,
          source_date as sourceDate,
          url,
          excerpt,
          verification_status as verificationStatus,
          verified_at as verifiedAt,
          is_expired as isExpired
        from evidences
        where (${effectiveEvidenceSql("evidences")})
          and relation_id in (${placeholders})
        order by relation_id, source_date desc, id desc
      `,
    ).all(...relationIds) as Array<IndustryGraphEvidencePreview & { relationId: number }>;
    for (const evidence of evidenceRows) {
      const previews = evidenceByRelationId.get(evidence.relationId) ?? [];
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
      evidenceByRelationId.set(evidence.relationId, previews);
    }
  }

  return relations.map((relation) => ({
    ...relation,
    isWatchlist: relation.isWatchlist === 1,
    evidenceCount: Number(relation.evidenceCount),
    evidencePreviews: evidenceByRelationId.get(relation.relationId) ?? [],
  }));
}
