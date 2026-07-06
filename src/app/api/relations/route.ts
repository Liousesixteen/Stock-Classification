import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { manualStockRelationInputSchema } from "@/lib/domain/schemas";
import { upsertCompany } from "@/lib/repositories/companies";
import { upsertRelation } from "@/lib/repositories/relations";

export async function POST(request: NextRequest) {
  const parsed = manualStockRelationInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "标的参数无效" }, { status: 400 });
  }

  try {
    const db = getDatabase();
    const input = parsed.data;
    const saveRelation = db.transaction(() => {
      upsertCompany(db, {
        stockCode: input.stockCode,
        shortName: input.shortName,
        fullName: input.fullName,
        board: input.board,
        industry: input.industry,
        region: input.region,
        marketCapBand: input.marketCapBand,
        intro: input.intro,
        mainBusiness: input.mainBusiness,
        updatedAt: "",
      });

      return upsertRelation(db, {
        stockCode: input.stockCode,
        categoryId: input.categoryId,
        relationType: input.relationType,
        confidence: input.confidence,
        rationale: input.rationale,
        isWatchlist: input.isWatchlist,
      });
    });

    return NextResponse.json({ relationId: saveRelation() }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存标的失败" }, { status: 400 });
  }
}
