import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import {
  listCompanyFieldFacts,
  upsertCompanyFieldFact,
} from "@/lib/repositories/companyFieldFacts";

export type DAStockProviderStatus = {
  provider: string;
  kind: string;
  markets: string[];
  runtime: string;
  enabled: boolean;
  configuredKeys: string[];
};

export type DAStockProviderReadiness = {
  configured: boolean;
  providerCount: number;
  enabledCount: number;
  providers: DAStockProviderStatus[];
  error: string;
};

type DAStockQuote = Record<string, unknown> & {
  provider?: string;
  symbol?: string;
  name?: string;
};

type DAStockNewsResult = {
  name?: string;
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  siteName?: string;
  source?: string;
  datePublished?: string;
  published_date?: string;
};

type DAStockNews = {
  provider?: string;
  query?: string;
  results?: DAStockNewsResult[];
};

export type DAStockExternalMarket = "hk" | "us";

export type DAStockExternalResearchFacts = {
  configured: boolean;
  successfulProviders: string[];
  failedProviders: string[];
  fieldFacts: Array<{
    fieldKey: string;
    value?: unknown;
    status: "available" | "failed";
    provider: string;
    sourceUrl: string;
    confidence: "high" | "medium" | "low";
    verificationStatus: "unverified";
    fetchedAt: string;
    error?: string;
  }>;
};

export type DAStockOpenResearchFacts = Pick<
  DAStockExternalResearchFacts,
  "configured" | "successfulProviders" | "failedProviders" | "fieldFacts"
>;

const BRIDGE_CACHE_TTL_MS = 10 * 60 * 1_000;
const DEFAULT_TIMEOUT_MS = 24_000;
let readinessCache: { expiresAt: number; value: DAStockProviderReadiness } | null = null;

export function isDAStockDataSourceConfigured() {
  const config = bridgeConfig();
  return Boolean(config.cliPath && config.envPath && fs.existsSync(config.cliPath) && fs.existsSync(config.envPath));
}

export async function getDAStockProviderReadiness(): Promise<DAStockProviderReadiness> {
  if (readinessCache && readinessCache.expiresAt > Date.now()) return readinessCache.value;
  if (!isDAStockDataSourceConfigured()) {
    return {
      configured: false,
      providerCount: 0,
      enabledCount: 0,
      providers: [],
      error: "尚未配置外部数据源命令与环境文件",
    };
  }

  try {
    const payload = await runProviderCommand<{ providers?: Array<Record<string, unknown>> }>(["check-config"]);
    const providers = (payload.providers ?? []).map((item): DAStockProviderStatus => ({
      provider: text(item.provider),
      kind: text(item.kind),
      markets: stringArray(item.markets),
      runtime: text(item.runtime),
      enabled: item.enabled === true,
      configuredKeys: stringArray(item.configured_keys),
    })).filter((item) => item.provider);
    const value = {
      configured: true,
      providerCount: providers.length,
      enabledCount: providers.filter((item) => item.enabled).length,
      providers,
      error: "",
    };
    readinessCache = { expiresAt: Date.now() + 60_000, value };
    return value;
  } catch (error) {
    return {
      configured: true,
      providerCount: 0,
      enabledCount: 0,
      providers: [],
      error: publicBridgeError(error),
    };
  }
}

export async function refreshDAStockResearchFacts(
  db: Database.Database,
  stockCode: string,
  companyName: string,
) {
  if (!isDAStockDataSourceConfigured()) {
    return { configured: false, fromCache: false, successfulProviders: [] as string[], failedProviders: [] as string[] };
  }

  const existingFacts = listCompanyFieldFacts(db, stockCode).filter((fact) =>
    fact.provider.startsWith("da_stock_bridge_"),
  );
  const newestFetchedAt = Math.max(0, ...existingFacts.map((fact) => Date.parse(fact.fetchedAt.replace(" ", "T"))));
  if (existingFacts.some((fact) => fact.status === "available") && Date.now() - newestFetchedAt < BRIDGE_CACHE_TTL_MS) {
    return {
      configured: true,
      fromCache: true,
      successfulProviders: [...new Set(existingFacts.filter((fact) => fact.status === "available").map((fact) => fact.provider))],
      failedProviders: [...new Set(existingFacts.filter((fact) => fact.status === "failed").map((fact) => fact.provider))],
    };
  }

  const [quoteResult, newsResult] = await Promise.allSettled([
    runProviderCommand<DAStockQuote>(["quote", stockCode, "--market", "cn"]),
    runProviderCommand<DAStockNews>([
      "news",
      `${companyName || stockCode} ${stockCode} 最新公告 业绩 风险`,
      "--limit",
      "6",
      "--days",
      "90",
    ]),
  ]);
  const successfulProviders: string[] = [];
  const failedProviders: string[] = [];
  const fetchedAt = new Date().toISOString();

  if (quoteResult.status === "fulfilled") {
    const quote = normalizeQuote(quoteResult.value);
    const provider = `da_stock_bridge_${text(quoteResult.value.provider) || "quote"}`;
    const providerLabel = text(quoteResult.value.provider) || "行情";
    const sourceUrl = quoteSourceUrl(text(quoteResult.value.provider), stockCode);
    for (const [fieldKey, value] of Object.entries(quote)) {
      upsertCompanyFieldFact(db, {
        stockCode,
        fieldKey,
        provider,
        providerLabel,
        value,
        status: value === null ? "missing" : "available",
        sourceUrl,
        confidence: "high",
        verificationStatus: "unverified",
        fetchedAt,
      });
    }
    successfulProviders.push(provider);
  } else {
    const provider = "da_stock_bridge_quote";
    persistFailure(db, stockCode, "daStockQuote", provider, "行情", quoteResult.reason, fetchedAt);
    failedProviders.push(provider);
  }

  if (newsResult.status === "fulfilled") {
    const providerName = text(newsResult.value.provider) || "news";
    const provider = `da_stock_bridge_${providerName}`;
    const providerLabel = providerName;
    const rows = (newsResult.value.results ?? []).slice(0, 6).filter((row) => text(row.url));
    rows.forEach((row, index) => {
      upsertCompanyFieldFact(db, {
        stockCode,
        fieldKey: `newsSearchResult:${index + 1}`,
        provider,
        providerLabel,
        value: {
          title: text(row.name) || text(row.title),
          summary: compactText(text(row.summary) || text(row.snippet), 900),
          source: text(row.siteName) || text(row.source) || providerName,
          sourceDate: text(row.datePublished) || text(row.published_date),
        },
        status: "available",
        sourceUrl: text(row.url),
        confidence: "medium",
        verificationStatus: "unverified",
        fetchedAt,
      });
    });
    if (rows.length > 0) successfulProviders.push(provider);
    else {
      persistFailure(db, stockCode, "newsSearchResult", provider, providerLabel, "检索完成但没有可引用结果", fetchedAt);
      failedProviders.push(provider);
    }
  } else {
    const provider = "da_stock_bridge_news";
    persistFailure(db, stockCode, "newsSearchResult", provider, "新闻检索", newsResult.reason, fetchedAt);
    failedProviders.push(provider);
  }

  return { configured: true, fromCache: false, successfulProviders, failedProviders };
}

export async function fetchDAStockExternalResearchFacts(
  symbol: string,
  market: DAStockExternalMarket,
  securityName: string,
): Promise<DAStockExternalResearchFacts> {
  if (!isDAStockDataSourceConfigured()) {
    return { configured: false, successfulProviders: [], failedProviders: [], fieldFacts: [] };
  }
  const [quoteResult, newsResult] = await Promise.allSettled([
    runProviderCommand<DAStockQuote>(["quote", symbol, "--market", market]),
    runProviderCommand<DAStockNews>([
      "news",
      `${securityName || symbol} ${symbol} 最新公告 财报 业绩 风险`,
      "--limit",
      "8",
      "--days",
      "120",
    ]),
  ]);
  const fetchedAt = new Date().toISOString();
  const fieldFacts: DAStockExternalResearchFacts["fieldFacts"] = [];
  const successfulProviders: string[] = [];
  const failedProviders: string[] = [];

  if (quoteResult.status === "fulfilled") {
    const provider = text(quoteResult.value.provider) || "quote";
    const sourceUrl = externalQuoteSourceUrl(provider, symbol, market);
    for (const [fieldKey, value] of Object.entries(normalizeQuote(quoteResult.value))) {
      if (value === null) continue;
      fieldFacts.push({
        fieldKey: `externalQuote.${fieldKey}`,
        value,
        status: "available",
        provider,
        sourceUrl,
        confidence: "high",
        verificationStatus: "unverified",
        fetchedAt,
      });
    }
    successfulProviders.push(`da_stock_bridge_${provider}`);
  } else {
    fieldFacts.push({
      fieldKey: "externalQuote",
      status: "failed",
      provider: "行情",
      sourceUrl: "",
      confidence: "low",
      verificationStatus: "unverified",
      fetchedAt,
      error: publicBridgeError(quoteResult.reason),
    });
    failedProviders.push("da_stock_bridge_quote");
  }

  if (newsResult.status === "fulfilled") {
    const provider = text(newsResult.value.provider) || "news";
    const rows = (newsResult.value.results ?? []).slice(0, 8).filter((row) => text(row.url));
    rows.forEach((row, index) => fieldFacts.push({
      fieldKey: `externalNews:${index + 1}`,
      value: {
        title: text(row.name) || text(row.title),
        summary: compactText(text(row.summary) || text(row.snippet), 900),
        source: text(row.siteName) || text(row.source) || provider,
        sourceDate: text(row.datePublished) || text(row.published_date),
      },
      status: "available",
      provider,
      sourceUrl: text(row.url),
      confidence: "medium",
      verificationStatus: "unverified",
      fetchedAt,
    }));
    if (rows.length) successfulProviders.push(`da_stock_bridge_${provider}`);
    else failedProviders.push(`da_stock_bridge_${provider}`);
  } else {
    fieldFacts.push({
      fieldKey: "externalNews",
      status: "failed",
      provider: "新闻检索",
      sourceUrl: "",
      confidence: "low",
      verificationStatus: "unverified",
      fetchedAt,
      error: publicBridgeError(newsResult.reason),
    });
    failedProviders.push("da_stock_bridge_news");
  }

  return { configured: true, successfulProviders, failedProviders, fieldFacts };
}

// The research Agent can call its generic intelligence-search tool
// without first binding the conversation to a company. Keep the same ability
// for broad-market and thematic questions in this application.
export async function fetchDAStockOpenResearchFacts(
  query: string,
  options: { limit?: number; days?: number; fieldPrefix?: string; excludeCommunity?: boolean; trustedPublishersOnly?: boolean } = {},
): Promise<DAStockOpenResearchFacts> {
  if (!isDAStockDataSourceConfigured()) {
    return { configured: false, successfulProviders: [], failedProviders: [], fieldFacts: [] };
  }
  const limit = Math.max(1, Math.min(options.limit ?? 10, 20));
  const days = Math.max(1, Math.min(options.days ?? 30, 365));
  const fieldPrefix = options.fieldPrefix?.trim() || "openNews";
  const fetchedAt = new Date().toISOString();
  try {
    const news = await runProviderCommand<DAStockNews>([
      "news",
      query,
      "--limit",
      String(limit),
      "--days",
      String(days),
    ]);
    const provider = text(news.provider) || "news";
    const rows = (news.results ?? [])
      .filter((row) => text(row.url))
      .filter((row) => !options.excludeCommunity || classifyOpenResearchSource(row) !== "community")
      .filter((row) => !options.trustedPublishersOnly || isTrustedOpenMarketSource(row))
      .slice(0, limit);
    return {
      configured: true,
      successfulProviders: rows.length ? [`da_stock_bridge_${provider}`] : [],
      failedProviders: rows.length ? [] : [`da_stock_bridge_${provider}`],
      fieldFacts: rows.map((row, index) => ({
        fieldKey: `${fieldPrefix}:${index + 1}`,
        value: {
          title: text(row.name) || text(row.title),
          summary: compactText(text(row.summary) || text(row.snippet), 900),
          source: text(row.siteName) || text(row.source) || provider,
          sourceDate: text(row.datePublished) || text(row.published_date),
        },
        status: "available" as const,
        provider,
        sourceUrl: text(row.url),
        confidence: openResearchConfidence(row),
        verificationStatus: "unverified" as const,
        fetchedAt,
      })),
    };
  } catch (error) {
    return {
      configured: true,
      successfulProviders: [],
      failedProviders: ["da_stock_bridge_news"],
      fieldFacts: [{
        fieldKey: fieldPrefix,
        status: "failed",
        provider: "新闻检索",
        sourceUrl: "",
        confidence: "low",
        verificationStatus: "unverified",
        fetchedAt,
        error: publicBridgeError(error),
      }],
    };
  }
}

function classifyOpenResearchSource(row: DAStockNewsResult) {
  const source = `${text(row.siteName)} ${text(row.source)} ${text(row.url)}`.toLocaleLowerCase();
  if (/guba\.eastmoney\.com|caifuhao\.eastmoney\.com|(?:^|[/.])bbs\.|hupu\.com|tieba\.baidu\.com|toutiao\.com|cofool\.com|xueqiu\.com|zhihu\.com|weibo\.com|股吧|财富号|论坛|社区|博客|自媒体|投顾问答/.test(source)) return "community" as const;
  if (/gov\.cn|pbc\.gov\.cn|csrc\.gov\.cn|stats\.gov\.cn|sse\.com\.cn|szse\.cn/.test(source)) return "official" as const;
  return "publisher" as const;
}

export function isTrustedOpenMarketSource(row: Pick<DAStockNewsResult, "url" | "siteName" | "source">) {
  if (classifyOpenResearchSource(row) === "official") return true;
  let hostname = "";
  try {
    hostname = new URL(text(row.url)).hostname.toLocaleLowerCase();
  } catch {
    return false;
  }
  return /^(?:finance\.sina\.com\.cn|stock\.finance\.sina\.com\.cn|finance\.eastmoney\.com|stock\.eastmoney\.com|www\.cls\.cn|cls\.cn|www\.cnstock\.com|cnstock\.com|www\.stcn\.com|stcn\.com|www\.yicai\.com|yicai\.com|www\.cs\.com\.cn|cs\.com\.cn|www\.21jingji\.com|21jingji\.com|www\.xinhuanet\.com|xinhuanet\.com|finance\.people\.com\.cn)$/i.test(hostname);
}

function openResearchConfidence(row: DAStockNewsResult): "high" | "medium" | "low" {
  const sourceClass = classifyOpenResearchSource(row);
  return sourceClass === "official" ? "high" : sourceClass === "community" ? "low" : "medium";
}

function bridgeConfig() {
  return {
    python: (process.env.MARKET_PROVIDER_PYTHON_BIN || process.env.DA_STOCK_PYTHON_BIN)?.trim() || "python3",
    cliPath: (process.env.MARKET_PROVIDER_CLI || process.env.DA_STOCK_PROVIDER_CLI)?.trim() || "",
    envPath: (process.env.MARKET_PROVIDER_ENV_PATH || process.env.DA_STOCK_ENV_PATH)?.trim() || "",
    timeoutMs: boundedNumber(process.env.MARKET_PROVIDER_TIMEOUT_MS || process.env.DA_STOCK_PROVIDER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 3_000, 60_000),
  };
}

function runProviderCommand<T>(args: string[]) {
  const config = bridgeConfig();
  if (!config.cliPath || !config.envPath) return Promise.reject(new Error("外部数据源桥接尚未配置"));
  if (!fs.existsSync(config.cliPath) || !fs.existsSync(config.envPath)) {
    return Promise.reject(new Error("外部数据源脚本或环境配置不存在"));
  }

  return new Promise<T>((resolve, reject) => {
    execFile(
      config.python,
      [config.cliPath, "--env", config.envPath, ...args],
      {
        cwd: path.dirname(config.cliPath),
        env: { ...process.env, PYTHONWARNINGS: "ignore" },
        timeout: config.timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(publicBridgeError(stderr || stdout || error.message)));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as T);
        } catch {
          reject(new Error("外部数据源返回了无法解析的数据"));
        }
      },
    );
  });
}

function normalizeQuote(value: DAStockQuote) {
  return {
    price: numberOrNull(value.price),
    previousClose: numberOrNull(value.previous_close),
    open: numberOrNull(value.open),
    high: numberOrNull(value.high),
    low: numberOrNull(value.low),
    changePercent: numberOrNull(value.change_pct),
    turnoverPercent: numberOrNull(value.turnover_pct),
    peTtm: numberOrNull(value.pe_ttm),
    pb: numberOrNull(value.pb),
    totalMarketCapYi: numberOrNull(value.market_cap),
    circulatingMarketCapYi: numberOrNull(value.float_market_cap),
    limitUp: numberOrNull(value.limit_up),
    limitDown: numberOrNull(value.limit_down),
  };
}

function quoteSourceUrl(provider: string, stockCode: string) {
  const prefix = stockCode.startsWith("6") || stockCode.startsWith("9")
    ? "sh"
    : stockCode.startsWith("8") || stockCode.startsWith("4") || stockCode.startsWith("92") ? "bj" : "sz";
  if (provider === "tencent") return `https://qt.gtimg.cn/q=${prefix}${stockCode}`;
  if (provider === "sina") return `https://hq.sinajs.cn/list=${prefix}${stockCode}`;
  return "https://github.com/ZhuLinsen/daily_stock_analysis";
}

function externalQuoteSourceUrl(provider: string, symbol: string, market: DAStockExternalMarket) {
  if (market === "hk") {
    return provider === "tencent"
      ? `https://gu.qq.com/hk${symbol}/gp`
      : `https://finance.yahoo.com/quote/${symbol}.HK`;
  }
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol.toUpperCase())}`;
}

function persistFailure(
  db: Database.Database,
  stockCode: string,
  fieldKey: string,
  provider: string,
  providerLabel: string,
  error: unknown,
  fetchedAt: string,
) {
  upsertCompanyFieldFact(db, {
    stockCode,
    fieldKey,
    provider,
    providerLabel,
    status: "failed",
    confidence: "low",
    verificationStatus: "unverified",
    error: publicBridgeError(error),
    fetchedAt,
  });
}

function publicBridgeError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "外部数据源调用失败");
  return raw
    .replace(/([?&](?:token|apikey|api_key)=)[^&\s"']+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[REDACTED]")
    .slice(0, 500);
}

function boundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.round(parsed))) : fallback;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function compactText(value: string, limit: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}
