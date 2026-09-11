import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  lookupFastStockProfile,
  lookupStockProfile,
  resolveStockMention,
} from "@/lib/datasources/stockLookup";
import { getDatabase } from "@/lib/db/client";
import { getCategoryById } from "@/lib/repositories/categories";
import { getCompany } from "@/lib/repositories/companies";
import { listRelationsForCompany } from "@/lib/repositories/relations";
import { buildCompanyResearchFacts } from "@/lib/research/companyFacts";
import { buildResearchEvidenceCatalog } from "@/lib/research/researchEvidenceCatalog";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("query") ?? request.nextUrl.searchParams.get("code") ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "请输入股票代码或名称" }, { status: 400 });
  }

  try {
    const mode = request.nextUrl.searchParams.get("mode");
    const mention = mode === "mention" ? resolveStockMention(query) : undefined;
    if (mode === "mention" && !mention) throw new Error("未匹配到唯一 A 股股票");
    const profile = mode === "quick" || mention
      ? lookupFastStockProfile(mention?.displayCode ?? query)
      : await lookupStockProfile(query);
    const db = getDatabase();
    const storedCompany = getCompany(db, profile.stockCode);
    const resolvedProfile = {
      ...profile,
      shortName: profile.shortName || storedCompany?.shortName || profile.stockCode,
      fullName: profile.fullName || storedCompany?.fullName || "",
      board: profile.board || storedCompany?.board || "",
      industry: profile.industry || storedCompany?.industry || "",
      region: profile.region || storedCompany?.region || "",
      marketCapBand: profile.marketCapBand || storedCompany?.marketCapBand || "",
      intro: profile.intro || storedCompany?.intro || "",
      mainBusiness: profile.mainBusiness || storedCompany?.mainBusiness || "",
    };
    const relations = listRelationsForCompany(db, profile.stockCode)
      .sort((left, right) => relationRank(left.relationType) - relationRank(right.relationType));
    const trustedRelation = relations.find((item) => item.relationType !== "待验证" && item.confidence !== "低");
    const trackingRelation = trustedRelation ?? relations[0];
    const category = trustedRelation ? getCategoryById(db, trustedRelation.categoryId) : null;
    const facts = buildCompanyResearchFacts(db, profile.stockCode, trustedRelation?.categoryId ?? null);
    const availableEvidenceCount = facts ? buildResearchEvidenceCatalog(facts).length : 0;
    return NextResponse.json({
      profile: {
        ...resolvedProfile,
        relationId: trackingRelation?.id ?? null,
        isWatchlist: relations.some((item) => item.isWatchlist),
        categoryId: trustedRelation?.categoryId ?? null,
        categoryName: category?.name ?? "",
        availableEvidenceCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "股票基础资料查询失败";
    return NextResponse.json({ error: message }, { status: message.includes("未") ? 404 : 502 });
  }
}

function relationRank(value: string) {
  if (value === "主营业务") return 0;
  if (value === "重要相关") return 1;
  return 2;
}
