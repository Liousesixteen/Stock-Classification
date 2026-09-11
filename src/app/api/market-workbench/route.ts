import { NextResponse } from "next/server";
import {
  fetchEastmoneyCapitalFlow,
  fetchEastmoneyMarketBreadth,
  fetchEastmoneyMarketNews,
  fetchEastmoneySectorRankings,
  fetchTencentMarketIndices,
  fetchTencentStockQuote,
  getNativeResearchProviderReadiness,
} from "@/lib/datasources/daStockNativeResearchProvider";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type SourceResult = {
  status: "available" | "failed" | "skipped";
  provider: string;
  value?: unknown;
  sourceUrl?: string;
  fetchedAt?: string;
  error?: string;
};

/**
 * Native market snapshot for the integrated workbench.
 *
 * This route deliberately orchestrates the same provider functions used by AI
 * research. It does not proxy the embedded market service and it never
 * fabricates market values when a provider is unavailable.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = normalizeSymbol(url.searchParams.get("symbol"));
  const startedAt = Date.now();
  const readiness = getNativeResearchProviderReadiness();

  const tasks: Array<{ provider: string; run: () => Promise<{ value: unknown; sourceUrl: string; fetchedAt: string }> }> = [
    {
      provider: "tencent-indices",
      run: async () => {
        const result = await fetchTencentMarketIndices();
        return { value: result.indices, sourceUrl: result.sourceUrl, fetchedAt: result.fetchedAt };
      },
    },
    {
      provider: "eastmoney-breadth",
      run: async () => {
        const result = await fetchEastmoneyMarketBreadth();
        return { value: result.breadth, sourceUrl: result.sourceUrl, fetchedAt: result.fetchedAt };
      },
    },
    {
      provider: "eastmoney-sectors",
      run: async () => {
        const result = await fetchEastmoneySectorRankings(undefined, 8);
        return {
          value: { total: result.total, top: result.top, bottom: result.bottom },
          sourceUrl: result.sourceUrl,
          fetchedAt: result.fetchedAt,
        };
      },
    },
    {
      provider: "eastmoney-news",
      run: async () => {
        const result = await fetchEastmoneyMarketNews(undefined, 8);
        return { value: result.news, sourceUrl: result.sourceUrl, fetchedAt: result.fetchedAt };
      },
    },
  ];

  if (symbol) {
    tasks.push(
      {
        provider: "tencent-quote",
        run: async () => {
          const result = await fetchTencentStockQuote(symbol);
          return { value: result.quote, sourceUrl: result.sourceUrl, fetchedAt: result.fetchedAt };
        },
      },
      {
        provider: "eastmoney-flow",
        run: async () => {
          const result = await fetchEastmoneyCapitalFlow(symbol);
          return { value: result.flow, sourceUrl: result.sourceUrl, fetchedAt: result.fetchedAt };
        },
      },
    );
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.run()));
  const sources: SourceResult[] = settled.map((result, index) => {
    const provider = tasks[index].provider;
    if (result.status === "fulfilled") {
      return { status: "available", provider, ...result.value };
    }
    return { status: "failed", provider, error: publicError(result.reason) };
  });
  if (!symbol) sources.push({ status: "skipped", provider: "stock-detail" });

  const valueFor = (provider: string) => sources.find((source) => source.provider === provider && source.status === "available")?.value;
  const availableCount = sources.filter((source) => source.status === "available").length;
  const failedCount = sources.filter((source) => source.status === "failed").length;

  return NextResponse.json({
    asOf: newestFetchedAt(sources) ?? new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    symbol,
    indices: valueFor("tencent-indices") ?? [],
    breadth: valueFor("eastmoney-breadth") ?? null,
    sectors: valueFor("eastmoney-sectors") ?? { total: 0, top: [], bottom: [] },
    news: valueFor("eastmoney-news") ?? [],
    quote: valueFor("tencent-quote") ?? null,
    flow: valueFor("eastmoney-flow") ?? null,
    sources,
    health: {
      availableCount,
      failedCount,
      totalCount: sources.length,
      partial: availableCount > 0 && failedCount > 0,
      nativeProviderCount: readiness.providerCount,
    },
  }, {
    status: availableCount > 0 ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeSymbol(value: string | null) {
  const candidate = value?.trim().replace(/\s+/g, "") ?? "";
  return /^\d{6}$/.test(candidate) ? candidate : "";
}

function newestFetchedAt(sources: SourceResult[]) {
  const dates = sources
    .filter((source) => source.status === "available" && source.fetchedAt)
    .map((source) => source.fetchedAt!)
    .sort();
  return dates.at(-1);
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "数据源调用失败");
  return message.replace(/([?&](?:token|apikey|api_key)=)[^&\s"']+/gi, "$1[REDACTED]").slice(0, 240);
}
