import type Database from "better-sqlite3";
import type { IndustryGraphRelationRow } from "@/lib/industry-graph/types";

export function listIndustryGraphRelations(db: Database.Database): IndustryGraphRelationRow[] {
  return db
    .prepare(
      `
        select
          r.category_id as categoryId,
          r.stock_code as stockCode,
          c.short_name as shortName,
          r.relation_type as relationType,
          r.confidence,
          count(e.id) as evidenceCount
        from company_category_relations r
        join companies c on c.stock_code = r.stock_code
        left join evidences e on e.relation_id = r.id and e.is_expired = 0
        group by r.id
        order by r.category_id, r.stock_code
      `,
    )
    .all() as IndustryGraphRelationRow[];
}
