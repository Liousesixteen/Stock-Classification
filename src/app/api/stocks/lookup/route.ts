import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { lookupFastStockProfile, lookupStockProfile } from "@/lib/datasources/stockLookup";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("query") ?? request.nextUrl.searchParams.get("code") ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "请输入股票代码或名称" }, { status: 400 });
  }

  try {
    const profile = request.nextUrl.searchParams.get("mode") === "quick"
      ? lookupFastStockProfile(query)
      : await lookupStockProfile(query);
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "股票基础资料查询失败";
    return NextResponse.json({ error: message }, { status: message.includes("未") ? 404 : 502 });
  }
}
