import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { organizeStockFacts } from "@/lib/agents/classificationAgent";
import { lookupStockProfile } from "@/lib/datasources/stockLookup";
import { getDatabase } from "@/lib/db/client";
import { getCategoryById } from "@/lib/repositories/categories";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("query") ?? "").trim();
  const categoryId = Number(request.nextUrl.searchParams.get("categoryId"));
  if (!query) {
    return NextResponse.json({ error: "请输入股票代码或名称" }, { status: 400 });
  }
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return NextResponse.json({ error: "分类参数无效" }, { status: 400 });
  }

  try {
    const db = getDatabase();
    const category = getCategoryById(db, categoryId);
    if (!category) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 });
    }

    const profile = await lookupStockProfile(query);
    const suggestion = organizeStockFacts({ profile, category });
    return NextResponse.json({ profile, suggestion });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent 归类失败";
    return NextResponse.json({ error: message }, { status: message.includes("未") ? 404 : 502 });
  }
}
