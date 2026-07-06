import type Database from "better-sqlite3";
import type { ValidImportRow } from "./preview";
import { createEvidence } from "@/lib/repositories/evidence";
import { getCompany, upsertCompany } from "@/lib/repositories/companies";
import { setPrimaryEvidenceForRelation, upsertRelation } from "@/lib/repositories/relations";

export type ImportCommitResult = {
  companiesUpserted: number;
  relationsUpserted: number;
  evidencesCreated: number;
  notesCreated: number;
};

export function commitImportRows(db: Database.Database, rows: ValidImportRow[]): ImportCommitResult {
  const result: ImportCommitResult = {
    companiesUpserted: 0,
    relationsUpserted: 0,
    evidencesCreated: 0,
    notesCreated: 0,
  };

  const insertNote = db.prepare(`
    insert into research_notes (target_type, target_id, note_type, content, tags)
    values ('company', @targetId, '研究备注', @content, '[]')
  `);

  const commit = db.transaction((validRows: ValidImportRow[]) => {
    for (const row of validRows) {
      const existingCompany = getCompany(db, row.stockCode);
      upsertCompany(db, {
        stockCode: row.stockCode,
        shortName: row.shortName,
        fullName: existingCompany?.fullName ?? "",
        board: existingCompany?.board ?? "",
        industry: existingCompany?.industry ?? "",
        region: existingCompany?.region ?? "",
        marketCapBand: existingCompany?.marketCapBand ?? "",
        intro: row.intro,
        mainBusiness: existingCompany?.mainBusiness ?? "",
        updatedAt: "",
      });
      result.companiesUpserted += 1;

      const relationId = upsertRelation(db, {
        stockCode: row.stockCode,
        categoryId: row.categoryId,
        relationType: row.relationType,
        confidence: row.confidence,
        rationale: row.rationale,
        isWatchlist: row.relationType === "待验证",
      });
      result.relationsUpserted += 1;

      if (row.sourceTitle || row.sourceUrl) {
        const evidenceId = createEvidence(db, {
          relationId,
          sourceType: row.sourceType,
          title: row.sourceTitle || row.sourceUrl,
          sourceDate: row.sourceDate,
          url: row.sourceUrl,
          excerpt: row.sourceExcerpt,
          credibility: row.confidence,
          isExpired: false,
        });
        setPrimaryEvidenceForRelation(db, relationId, evidenceId);
        result.evidencesCreated += 1;
      }

      if (row.note) {
        insertNote.run({
          targetId: row.stockCode,
          content: row.note,
        });
        result.notesCreated += 1;
      }
    }
  });

  commit(rows);
  return result;
}
