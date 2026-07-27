import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { lookupFastStockProfile, lookupStockProfile } from "@/lib/datasources/stockLookup";
import { getDatabase } from "@/lib/db/client";
import { getCategoryById } from "@/lib/repositories/categories";
import { listRelationsForCompany } from "@/lib/repositories/relations";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("query") ?? request.nextUrl.searchParams.get("code") ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "请输入股票代码或名称" }, { status: 400 });
  }

  try {
    const profile = request.nextUrl.searchParams.get("mode") === "quick"
      ? lookupFastStockProfile(query)
      : await lookupStockProfile(query);
    const relation = listRelationsForCompany(getDatabase(), profile.stockCode)
      .sort((left, right) => relationRank(left.relationType) - relationRank(right.relationType))[0];
    const category = relation ? getCategoryById(getDatabase(), relation.categoryId) : null;
    return NextResponse.json({
      profile: {
        ...profile,
        categoryId: relation?.categoryId ?? null,
        categoryName: category?.name ?? "",
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
