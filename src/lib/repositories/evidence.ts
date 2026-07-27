import type Database from "better-sqlite3";
import type { ConfidenceLevel, Evidence, SourceType } from "@/lib/domain/types";
import { setPrimaryEvidenceForRelation } from "./relations";

export type EvidenceInput = {
  relationId: number;
  sourceType: SourceType;
  title: string;
  sourceDate: string;
  url: string;
  excerpt: string;
  credibility: ConfidenceLevel;
  isExpired: boolean;
};

type EvidenceIdRow = {
  id: number;
};

type EvidenceRow = Omit<Evidence, "isExpired"> & {
  isExpired: number;
};

export function createEvidence(db: Database.Database, evidence: EvidenceInput) {
  const result = db
    .prepare(
      `
        insert into evidences (
          relation_id,
          source_type,
          title,
          source_date,
          url,
          excerpt,
          credibility,
          is_expired
        )
        values (
          @relationId,
          @sourceType,
          @title,
          @sourceDate,
          @url,
          @excerpt,
          @credibility,
          @isExpired
        )
      `,
    )
    .run({ ...evidence, isExpired: evidence.isExpired ? 1 : 0 });

  return Number(result.lastInsertRowid);
}

export function addEvidenceToRelation(db: Database.Database, evidence: EvidenceInput) {
  const addEvidence = db.transaction(() => {
    const evidenceId = createEvidence(db, evidence);
    setPrimaryEvidenceForRelation(db, evidence.relationId, evidenceId);
    return listEvidenceForRelation(db, evidence.relationId).find((row) => row.id === evidenceId);
  });

  const created = addEvidence();
  if (!created) {
    throw new Error("新增证据失败");
  }
  return created;
}

export function deleteEvidenceForRelationByTitle(db: Database.Database, relationId: number, title: string) {
  if (!title.trim()) return 0;
  const result = db.prepare("delete from evidences where relation_id = ? and title = ?").run(relationId, title.trim());
  return result.changes;
}

export function listEvidenceForRelation(db: Database.Database, relationId: number) {
  const rows = db
    .prepare(
      `
        select
          id,
          relation_id as relationId,
          source_type as sourceType,
          title,
          source_date as sourceDate,
          url,
          excerpt,
          credibility,
          is_expired as isExpired
        from evidences
        where relation_id = ?
        order by source_date desc, id desc
      `,
    )
    .all(relationId) as (EvidenceIdRow & EvidenceRow)[];

  return rows.map((row): Evidence => ({ ...row, isExpired: row.isExpired === 1 }));
}
