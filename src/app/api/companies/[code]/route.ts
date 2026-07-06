import type Database from "better-sqlite3";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { getCompany } from "@/lib/repositories/companies";
import { listEvidenceForRelation } from "@/lib/repositories/evidence";
import { listRelationsForCompany } from "@/lib/repositories/relations";

type RouteContext = {
  params: Promise<{ code: string }>;
};

function listNotesForCompany(db: Database.Database, stockCode: string) {
  return db
    .prepare(
      `
        select
          id,
          target_type as targetType,
          target_id as targetId,
          note_type as noteType,
          content,
          tags,
          created_at as createdAt,
          updated_at as updatedAt
        from research_notes
        where target_type = 'company' and target_id = ?
        order by created_at desc, id desc
      `,
    )
    .all(stockCode);
}

export async function GET(_request: Request, context: RouteContext) {
  const { code } = await context.params;
  const db = getDatabase();
  const company = getCompany(db, code);

  if (!company) {
    return NextResponse.json({ error: "公司不存在" }, { status: 404 });
  }

  const relations = listRelationsForCompany(db, code);
  const evidenceByRelationId = Object.fromEntries(relations.map((relation) => [relation.id, listEvidenceForRelation(db, relation.id)]));

  return NextResponse.json({
    company,
    relations,
    evidenceByRelationId,
    notes: listNotesForCompany(db, code),
  });
}
