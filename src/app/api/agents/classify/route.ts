import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { organizeStockFactsWithConfiguredAgent } from "@/lib/agents/classificationAgentProvider";
import { organizeStockFacts } from "@/lib/agents/classificationAgent";
import { lookupFastStockProfile, lookupStockProfile } from "@/lib/datasources/stockLookup";
import { getDatabase } from "@/lib/db/client";
import { getCategoryById } from "@/lib/repositories/categories";
import { withApiObservability } from "@/lib/operations/observability";

async function classifyStock(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("query") ?? "").trim();
  const categoryId = Number(request.nextUrl.searchParams.get("categoryId"));
  const mode = (request.nextUrl.searchParams.get("mode") ?? "full").trim();
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

    if (mode === "quick") {
      const profile = await lookupQuickStockProfile(query);
      const suggestion = organizeStockFacts({ profile, category });
      return NextResponse.json({ profile, suggestion, mode: "quick" });
    }

    const providerOrder = request.nextUrl.searchParams
      .get("providers")
      ?.split(",")
      .map((provider) => provider.trim())
      .filter(Boolean);
    const profile = await lookupStockProfile(query, fetch, providerOrder ? { providerOrder } : {});
    const suggestion = await organizeStockFactsWithConfiguredAgent({ profile, category });
    return NextResponse.json({ profile, suggestion, mode: "full" });
  } catch (error) {
    try {
      const db = getDatabase();
      const category = getCategoryById(db, categoryId);
      if (category) {
        const profile = lookupFastStockProfile(query);
        const suggestion = organizeStockFacts({ profile, category });
        return NextResponse.json({
          profile,
          suggestion,
          mode: "fallback",
          warning: error instanceof Error ? error.message : "增强资料同步失败，已使用本地索引降级。",
        });
      }
    } catch {
      // Keep the original error below when even local fallback is unavailable.
    }
    const message = error instanceof Error ? error.message : "Agent 归类失败";
    return NextResponse.json({ error: message }, { status: message.includes("未") ? 404 : 502 });
  }
}

export const GET = withApiObservability("agent.classify", classifyStock, { audit: true });

async function lookupQuickStockProfile(query: string) {
  const fallbackProfile = lookupFastStockProfile(query);
  try {
    return await withTimeout(
      lookupStockProfile(query, fetch, { providerOrder: ["eastmoney_push2"], providerTimeoutMs: 1_100 }),
      1_200,
    );
  } catch {
    return fallbackProfile;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error("快速资料查询超时")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}
