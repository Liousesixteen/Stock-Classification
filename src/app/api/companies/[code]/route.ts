import type Database from "better-sqlite3";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { companyProfileInputSchema, stockCodeSchema } from "@/lib/domain/schemas";
import { getCompany, updateCompanyProfile } from "@/lib/repositories/companies";
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { code } = await context.params;
  const parsedCode = stockCodeSchema.safeParse(code);
  if (!parsedCode.success) {
    return NextResponse.json({ error: parsedCode.error.issues[0]?.message ?? "股票代码无效" }, { status: 400 });
  }

  const parsed = companyProfileInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "公司资料无效" }, { status: 400 });
  }

  try {
    const db = getDatabase();
    updateCompanyProfile(db, {
      stockCode: parsedCode.data,
      shortName: parsed.data.shortName,
      fullName: parsed.data.fullName,
      board: parsed.data.board,
      industry: parsed.data.industry,
      region: parsed.data.region,
      marketCapBand: parsed.data.marketCapBand,
      intro: parsed.data.intro,
      mainBusiness: parsed.data.mainBusiness,
      updatedAt: "",
    });

    return NextResponse.json({ company: getCompany(db, parsedCode.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存公司资料失败" }, { status: 400 });
  }
}
