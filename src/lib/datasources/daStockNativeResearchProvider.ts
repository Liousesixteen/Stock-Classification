import type Database from "better-sqlite3";
import {
  listCompanyFieldFacts,
  upsertCompanyFieldFact,
} from "@/lib/repositories/companyFieldFacts";
import { getStockProfileProviderPlan } from "./providerPlan";

export type NativeMarketIndex = {
  code: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  high: number | null;
  low: number | null;
  amountYi: number | null;
  quoteTime: string;
};

export type NativeStockQuote = {
  stockCode: string;
  name: string;
  price: number | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  amountYi: number | null;
  turnoverPercent: number | null;
  peTtm: number | null;
  pb: number | null;
  circulatingMarketCapYi: number | null;
  totalMarketCapYi: number | null;
  quoteTime: string;
};

export type NativeMarketBreadth = {
  sampleCount: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  strongUpCount: number;
  strongDownCount: number;
  totalAmountYi: number;
  medianChangePercent: number | null;
};

export type NativeSectorRanking = {
  code: string;
  name: string;
  changePercent: number | null;
  upCount: number | null;
  downCount: number | null;
  leader: string;
  leaderChangePercent: number | null;
};

export type NativeCapitalFlow = {
  stockCode: string;
  latestDate: string;
  latestMainNet: number | null;
  mainNet5d: number;
  mainNet10d: number;
  mainNet20d: number;
  latestSuperNet: number | null;
  latestLargeNet: number | null;
  records: Array<{
    date: string;
    mainNet: number;
    smallNet: number;
    mediumNet: number;
    largeNet: number;
    superNet: number;
  }>;
};

export type NativeResearchProviderReadiness = {
  configured: boolean;
  providerCount: number;
  enabledCount: number;
  providers: Array<{
    provider: string;
    kind: string;
    markets: string[];
    runtime: string;
    enabled: boolean;
    configuredKeys: string[];
  }>;
  error: string;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type EastmoneySectorPayload = { data?: { total?: number | null; diff?: Array<Record<string, unknown>> | null } | null };
type EastmoneyFundFlowPayload = { data?: { klines?: string[] | null } | null };
type EastmoneyFastNewsPayload = {
  data?: { fastNewsList?: Array<Record<string, unknown>> | null } | null;
};

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const NATIVE_CACHE_TTL_MS = 10 * 60 * 1_000;
const MARKET_INDEX_SYMBOLS = ["sh000001", "sz399001", "sz399006", "sh000300"];

export function getNativeResearchProviderReadiness(): NativeResearchProviderReadiness {
  const profileProviderIds = new Set(getStockProfileProviderPlan().map((provider) => provider.id));
  // Tencent/Eastmoney market endpoints are built-in, keyless providers. They
  // remain available even when optional company-profile crawling is disabled.
  const marketDataEnabled = true;
  const providers: NativeResearchProviderReadiness["providers"] = [
    { provider: "eastmoney", kind: "market-data", markets: ["CN"], runtime: "native-http", enabled: marketDataEnabled, configuredKeys: [] },
    { provider: "tencent", kind: "market-data", markets: ["CN"], runtime: "native-http", enabled: marketDataEnabled, configuredKeys: [] },
    { provider: "sina", kind: "fundamentals", markets: ["CN"], runtime: "native-http", enabled: [...profileProviderIds].some((id) => id.startsWith("sina_")), configuredKeys: [] },
    { provider: "baidu-stock", kind: "company-profile", markets: ["CN"], runtime: "native-http", enabled: profileProviderIds.has("baidu_related_blocks"), configuredKeys: [] },
    { provider: "cninfo", kind: "announcements", markets: ["CN"], runtime: "native-http", enabled: profileProviderIds.has("cninfo_announcements"), configuredKeys: [] },
    { provider: "deepseek", kind: "llm", markets: ["all"], runtime: "openai-compatible", enabled: Boolean(process.env.DEEPSEEK_API_KEY?.trim()), configuredKeys: process.env.DEEPSEEK_API_KEY?.trim() ? ["DEEPSEEK_API_KEY"] : [] },
  ];
  return {
    configured: marketDataEnabled,
    providerCount: providers.length,
    enabledCount: providers.filter((provider) => provider.enabled).length,
    providers,
    error: "",
  };
}

export function isNativeResearchDataSourceConfigured() {
  return true;
}

export async function fetchTencentStockQuote(stockCode: string, fetcher: Fetcher = fetch) {
  const symbol = `${stockCode.startsWith("6") || stockCode.startsWith("9") ? "sh" : "sz"}${stockCode}`;
  const sourceUrl = `https://qt.gtimg.cn/q=${symbol}`;
  const response = await fetcher(sourceUrl, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`腾讯个股行情查询失败：${response.status}`);
  const content = new TextDecoder("gbk").decode(await response.arrayBuffer());
  const match = content.match(/v_[a-z]{2}\d+="([^"]*)"/i);
  const values = match?.[1]?.split("~") ?? [];
  if (values.length < 46) throw new Error("腾讯个股行情未返回有效数据");
  const quote: NativeStockQuote = {
    stockCode: values[2] || stockCode,
    name: values[1] || stockCode,
    price: nullableNumber(values[3]),
    previousClose: nullableNumber(values[4]),
    open: nullableNumber(values[5]),
    high: nullableNumber(values[33]),
    low: nullableNumber(values[34]),
    change: nullableNumber(values[31]),
    changePercent: nullableNumber(values[32]),
    volume: nullableNumber(values[36]),
    amountYi: toYiFromWan(values[37]),
    turnoverPercent: nullableNumber(values[38]),
    peTtm: nullableNumber(values[39]),
    pb: nullableNumber(values[46]),
    circulatingMarketCapYi: nullableNumber(values[44]),
    totalMarketCapYi: nullableNumber(values[45]),
    quoteTime: normalizeTencentQuoteTime(values[30]),
  };
  if (quote.price === null) throw new Error("腾讯个股行情缺少最新价");
  return { sourceUrl, fetchedAt: new Date().toISOString(), quote };
}

export async function fetchTencentMarketIndices(fetcher: Fetcher = fetch) {
  const sourceUrl = `https://qt.gtimg.cn/q=${MARKET_INDEX_SYMBOLS.join(",")}`;
  const response = await fetcher(sourceUrl, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`腾讯指数查询失败：${response.status}`);
  const content = new TextDecoder("gbk").decode(await response.arrayBuffer());
  const indices = content.split(";").flatMap((line): NativeMarketIndex[] => {
    const match = line.match(/v_([a-z]{2}\d+)="([^"]*)"/i);
    if (!match) return [];
    const values = match[2].split("~");
    if (values.length < 38) return [];
    return [{
      code: values[2] || match[1],
      name: values[1] || match[1],
      price: nullableNumber(values[3]),
      changePercent: nullableNumber(values[32]),
      high: nullableNumber(values[33]),
      low: nullableNumber(values[34]),
      amountYi: toYiFromWan(values[37]),
      quoteTime: normalizeTencentQuoteTime(values[30]),
    }];
  });
  if (indices.length === 0) throw new Error("腾讯指数未返回有效数据");
  return { sourceUrl, fetchedAt: new Date().toISOString(), indices };
}

export async function fetchEastmoneyMarketBreadth(fetcher: Fetcher = fetch) {
  const params = {
    pn: "1", pz: "100", po: "1", np: "1", fltt: "2", invt: "2", fid: "f3",
    fs: "m:0+t:6,m:0+t:13,m:0+t:80,m:1+t:2,m:1+t:23",
    fields: "f3,f6,f12,f14",
  };
  const first = await fetchEastmoneyClist(params, fetcher, "市场宽度");
  const firstPayload = await first.response.json() as EastmoneySectorPayload;
  const firstRows = firstPayload.data?.diff ?? [];
  const total = Math.max(firstRows.length, Number(firstPayload.data?.total ?? 0));
  const pageCount = Math.max(1, Math.ceil(total / 100));
  const remaining = await Promise.allSettled(Array.from({ length: pageCount - 1 }, (_, index) =>
    fetchEastmoneyClist({ ...params, pn: String(index + 2) }, fetcher, "市场宽度")
      .then(async ({ response }) => ((await response.json()) as EastmoneySectorPayload).data?.diff ?? []),
  ));
  const rawRows = [firstRows, ...remaining.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])].flat();
  const rows = rawRows.map((row) => ({
    changePercent: nullableNumber(row.f3),
    amount: nullableNumber(row.f6),
  })).filter((row) => row.changePercent !== null);
  if (!rows.length) throw new Error("东财市场宽度未返回有效数据");
  const changes = rows.map((row) => row.changePercent!).sort((a, b) => a - b);
  const middle = Math.floor(changes.length / 2);
  const median = changes.length % 2 ? changes[middle] : (changes[middle - 1] + changes[middle]) / 2;
  const breadth: NativeMarketBreadth = {
    sampleCount: rows.length,
    upCount: changes.filter((value) => value > 0).length,
    downCount: changes.filter((value) => value < 0).length,
    flatCount: changes.filter((value) => value === 0).length,
    strongUpCount: changes.filter((value) => value >= 9.8).length,
    strongDownCount: changes.filter((value) => value <= -9.8).length,
    totalAmountYi: roundNumber(rows.reduce((sum, row) => sum + (row.amount ?? 0), 0) / 100_000_000),
    medianChangePercent: roundNumber(median),
  };
  return { sourceUrl: first.url.toString(), fetchedAt: new Date().toISOString(), breadth };
}

export async function fetchEastmoneyMarketNews(fetcher: Fetcher = fetch, limit = 10) {
  const url = new URL("https://np-weblist.eastmoney.com/comm/web/getFastNewsList");
  const params = {
    client: "web",
    biz: "web_724",
    fastColumn: "102",
    pageSize: "30",
    sortEnd: "",
    req_trace: `${Date.now()}01`,
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetcher(url, {
    headers: { "User-Agent": USER_AGENT, Referer: "https://finance.eastmoney.com/" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`东财市场快讯查询失败：${response.status}`);
  const payload = await response.json() as EastmoneyFastNewsPayload;
  const all = (payload.data?.fastNewsList ?? []).map((item) => ({
    code: text(item.code),
    title: text(item.title),
    summary: text(item.summary),
    publishedAt: text(item.showTime),
    relatedStocks: Array.isArray(item.stockList) ? item.stockList.map(text).filter(Boolean) : [],
  })).filter((item) => item.title && item.summary);
  const relevant = all.filter((item) => /A股|股票|股份|公司|证监|交易所|上交所|深交所|央行|财政|人民币|基金|券商|银行|期货|地产|消费|科技|产业|净利润|营收|公告/.test(`${item.title}${item.summary}`));
  const news = (relevant.length ? relevant : all).slice(0, Math.max(1, Math.min(limit, 20)));
  if (!news.length) throw new Error("东财市场快讯未返回有效数据");
  return { sourceUrl: url.toString(), fetchedAt: new Date().toISOString(), news };
}

export async function fetchEastmoneySectorRankings(fetcher: Fetcher = fetch, topN = 10) {
  const params = {
    pn: "1",
    pz: "100",
    po: "1",
    np: "1",
    fltt: "2",
    invt: "2",
    fid: "f3",
    fs: "m:90+t:2",
    fields: "f3,f12,f14,f104,f105,f136,f140",
  };
  const [rising, falling] = await Promise.all([
    fetchEastmoneyClist(params, fetcher, "行业排名"),
    fetchEastmoneyClist({ ...params, po: "0" }, fetcher, "行业排名"),
  ]);
  const [risingPayload, fallingPayload] = await Promise.all([
    rising.response.json() as Promise<EastmoneySectorPayload>,
    falling.response.json() as Promise<EastmoneySectorPayload>,
  ]);
  const risingSectors = (risingPayload.data?.diff ?? []).map(normalizeSector).filter((row) => row.name);
  const fallingSectors = (fallingPayload.data?.diff ?? []).map(normalizeSector).filter((row) => row.name);
  if (risingSectors.length === 0 && fallingSectors.length === 0) throw new Error("东财行业排名未返回有效数据");
  const limit = Math.max(1, Math.min(topN, 20));
  return {
    sourceUrl: rising.url.toString(),
    fetchedAt: new Date().toISOString(),
    total: Math.max(Number(risingPayload.data?.total ?? 0), risingSectors.length, fallingSectors.length),
    top: risingSectors.slice(0, limit),
    bottom: fallingSectors.slice(0, limit),
  };
}

async function fetchEastmoneyClist(
  params: Record<string, string>,
  fetcher: Fetcher,
  label: string,
) {
  const errors: string[] = [];
  for (const origin of ["https://push2delay.eastmoney.com", "https://push2.eastmoney.com"]) {
    const url = new URL("/api/qt/clist/get", origin);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    try {
      const response = await fetcher(url, {
        headers: { "User-Agent": USER_AGENT, Referer: "https://quote.eastmoney.com/" },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (response.ok) return { response, url };
      errors.push(`${url.hostname}:${response.status}`);
    } catch (error) {
      errors.push(`${url.hostname}:${publicProviderError(error)}`);
    }
  }
  throw new Error(`东财${label}查询失败（${errors.join("；")}）`);
}

export async function fetchEastmoneyCapitalFlow(stockCode: string, fetcher: Fetcher = fetch) {
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get");
  url.searchParams.set("secid", `${eastmoneyMarket(stockCode)}.${stockCode}`);
  url.searchParams.set("fields1", "f1,f2,f3,f7");
  url.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56,f57");
  url.searchParams.set("lmt", "120");
  const response = await fetcher(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Referer: "https://quote.eastmoney.com/",
      Origin: "https://quote.eastmoney.com",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`东财资金流查询失败：${response.status}`);
  const payload = await response.json() as EastmoneyFundFlowPayload;
  const records = (payload.data?.klines ?? []).map((line) => {
    const fields = line.split(",");
    if (fields.length < 6) return null;
    const values = fields.slice(1, 6).map(flowNumber);
    return {
      date: fields[0],
      mainNet: values[0],
      smallNet: values[1],
      mediumNet: values[2],
      largeNet: values[3],
      superNet: values[4],
    };
  }).filter((row): row is NativeCapitalFlow["records"][number] => Boolean(row));
  if (records.length === 0) throw new Error("东财资金流未返回有效数据");
  const latest = records.at(-1)!;
  const result: NativeCapitalFlow = {
    stockCode,
    latestDate: latest.date,
    latestMainNet: latest.mainNet,
    mainNet5d: sumTail(records.map((row) => row.mainNet), 5),
    mainNet10d: sumTail(records.map((row) => row.mainNet), 10),
    mainNet20d: sumTail(records.map((row) => row.mainNet), 20),
    latestSuperNet: latest.superNet,
    latestLargeNet: latest.largeNet,
    records: records.slice(-20),
  };
  return { sourceUrl: url.toString(), fetchedAt: new Date().toISOString(), flow: result };
}

export async function refreshNativeResearchFacts(
  db: Database.Database,
  stockCode: string,
  fetcher: Fetcher = fetch,
) {
  const cachedFacts = listCompanyFieldFacts(db, stockCode).filter((fact) =>
    fact.provider.startsWith("native_research_"),
  );
  const newestFetchedAt = Math.max(0, ...cachedFacts.map((fact) => Date.parse(fact.fetchedAt.replace(" ", "T"))));
  if (cachedFacts.some((fact) => fact.status === "available") && Date.now() - newestFetchedAt < NATIVE_CACHE_TTL_MS) {
    return {
      fromCache: true,
      successfulProviders: [...new Set(cachedFacts.filter((fact) => fact.status === "available").map((fact) => fact.provider))],
      failedProviders: [...new Set(cachedFacts.filter((fact) => fact.status === "failed").map((fact) => fact.provider))],
    };
  }

  const tasks = [
    {
      definition: { fieldKey: "realtimeQuote", provider: "native_research_tencent_quote", providerLabel: "腾讯财经个股行情" },
      run: async () => {
        const payload = await fetchTencentStockQuote(stockCode, fetcher);
        return { value: payload.quote, sourceUrl: payload.sourceUrl, fetchedAt: payload.fetchedAt };
      },
    },
    {
      definition: { fieldKey: "marketIndices", provider: "native_research_tencent_indices", providerLabel: "腾讯财经主要指数" },
      run: async () => {
        const payload = await fetchTencentMarketIndices(fetcher);
        return { value: payload.indices, sourceUrl: payload.sourceUrl, fetchedAt: payload.fetchedAt };
      },
    },
    {
      definition: { fieldKey: "sectorRankings", provider: "native_research_eastmoney_sectors", providerLabel: "东方财富行业排名" },
      run: async () => {
        const payload = await fetchEastmoneySectorRankings(fetcher);
        return { value: { total: payload.total, top: payload.top, bottom: payload.bottom }, sourceUrl: payload.sourceUrl, fetchedAt: payload.fetchedAt };
      },
    },
    {
      definition: { fieldKey: "capitalFlow", provider: "native_research_eastmoney_capital_flow", providerLabel: "东方财富个股资金流" },
      run: async () => {
        const payload = await fetchEastmoneyCapitalFlow(stockCode, fetcher);
        return { value: payload.flow, sourceUrl: payload.sourceUrl, fetchedAt: payload.fetchedAt };
      },
    },
  ] as const;
  const operations = await Promise.allSettled(tasks.map((task) => task.run()));
  const successfulProviders: string[] = [];
  const failedProviders: string[] = [];

  operations.forEach((operation, index) => {
    const definition = tasks[index].definition;
    if (operation.status === "fulfilled") {
      const payload = operation.value;
      upsertCompanyFieldFact(db, {
        stockCode,
        ...definition,
        value: payload.value,
        status: "available",
        sourceUrl: payload.sourceUrl,
        confidence: "high",
        verificationStatus: "unverified",
        fetchedAt: payload.fetchedAt,
      });
      successfulProviders.push(definition.provider);
      return;
    }
    upsertCompanyFieldFact(db, {
      stockCode,
      ...definition,
      status: "failed",
      confidence: "low",
      verificationStatus: "unverified",
      error: publicProviderError(operation.reason),
      fetchedAt: new Date().toISOString(),
    });
    failedProviders.push(definition.provider);
  });

  return { fromCache: false, successfulProviders, failedProviders };
}

function normalizeSector(value: Record<string, unknown>): NativeSectorRanking {
  return {
    code: text(value.f12),
    name: text(value.f14),
    changePercent: nullableNumber(value.f3),
    upCount: nullableNumber(value.f104),
    downCount: nullableNumber(value.f105),
    leader: text(value.f140),
    leaderChangePercent: nullableNumber(value.f136),
  };
}

function eastmoneyMarket(stockCode: string) {
  return stockCode.startsWith("6") || stockCode.startsWith("9") ? 1 : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toYiFromWan(value: unknown) {
  const amountWan = nullableNumber(value);
  return amountWan === null ? null : roundNumber(amountWan / 10_000);
}

function normalizeTencentQuoteTime(value: unknown) {
  const raw = String(value ?? "").replace(/\D/g, "");
  if (raw.length < 8) return "";
  const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw.length >= 14 ? `${date} ${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}` : date;
}

function roundNumber(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function flowNumber(value: string) {
  const parsed = nullableNumber(value);
  return parsed ?? 0;
}

function sumTail(values: number[], count: number) {
  return Math.round(values.slice(-count).reduce((sum, value) => sum + value, 0) * 100) / 100;
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function publicProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "数据源调用失败");
  return message.replace(/([?&](?:token|apikey|api_key)=)[^&\s"']+/gi, "$1[REDACTED]").slice(0, 500);
}
