import fs from "node:fs";
import path from "node:path";

type StockLookupFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type StockIndexTuple = [
  canonicalCode: string,
  displayCode: string,
  nameZh: string,
  pinyinFull: string,
  pinyinAbbr: string,
  aliases: string[],
  market: string,
  assetType: string,
  active: boolean,
  popularity: number,
];

type StockLookupOptions = {
  stockIndexItems?: unknown[];
  stockIndexPath?: string;
};

export type ResolvedStock = {
  canonicalCode: string;
  displayCode: string;
  nameZh: string;
};

type EastmoneyStockData = {
  f57?: string | number;
  f58?: string;
  f116?: string | number;
  f117?: string | number;
  f127?: string;
  f189?: string | number;
};

type EastmoneyStockResponse = {
  data?: EastmoneyStockData | null;
};

export type StockLookupProfile = {
  stockCode: string;
  shortName: string;
  board: string;
  industry: string;
  region: string;
  marketCapBand: string;
  intro: string;
  mainBusiness: string;
  source: "eastmoney";
  sourceDetail: string;
};

const EASTMONEY_STOCK_URL = "https://push2.eastmoney.com/api/qt/stock/get";
const EASTMONEY_FIELDS = ["f57", "f58", "f116", "f117", "f127", "f189"].join(",");
const A_SHARE_CODE_PATTERN = /^(00|30|60|68|83|87)\d{4}$/;
let cachedStockIndex: StockIndexTuple[] | undefined;

export function eastmoneySecId(stockCode: string) {
  return stockCode.startsWith("6") ? `1.${stockCode}` : `0.${stockCode}`;
}

export function inferBoard(stockCode: string) {
  if (stockCode.startsWith("688") || stockCode.startsWith("689")) return "科创板";
  if (stockCode.startsWith("30")) return "创业板";
  if (stockCode.startsWith("60")) return "沪市主板";
  if (stockCode.startsWith("00")) return "深市主板";
  if (stockCode.startsWith("83") || stockCode.startsWith("87")) return "北交所";
  return "";
}

export function resolveStockQuery(query: string, options: StockLookupOptions = {}): ResolvedStock | undefined {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return undefined;

  if (A_SHARE_CODE_PATTERN.test(normalizedQuery)) {
    return {
      canonicalCode: `${normalizedQuery}.${normalizedQuery.startsWith("6") ? "SH" : "SZ"}`,
      displayCode: normalizedQuery,
      nameZh: "",
    };
  }

  const items = getStockIndexItems(options);
  let bestMatch: { item: StockIndexTuple; score: number } | undefined;

  for (const item of items) {
    if (!isCnStockItem(item)) continue;
    const score = calculateStockIndexScore(normalizedQuery, item);
    if (score === 0) continue;
    if (!bestMatch || score > bestMatch.score || (score === bestMatch.score && item[9] > bestMatch.item[9])) {
      bestMatch = { item, score };
    }
  }

  if (!bestMatch) return undefined;
  return {
    canonicalCode: bestMatch.item[0],
    displayCode: bestMatch.item[1],
    nameZh: bestMatch.item[2],
  };
}

export async function lookupStockProfile(
  query: string,
  fetcher: StockLookupFetcher = fetch,
  options: StockLookupOptions = {},
): Promise<StockLookupProfile> {
  const resolvedStock = resolveStockQuery(query, options);
  if (!resolvedStock) {
    throw new Error("未匹配到 A 股股票");
  }

  const normalizedCode = resolvedStock.displayCode;
  const url = new URL(EASTMONEY_STOCK_URL);
  url.searchParams.set("fltt", "2");
  url.searchParams.set("invt", "2");
  url.searchParams.set("fields", EASTMONEY_FIELDS);
  url.searchParams.set("secid", eastmoneySecId(normalizedCode));

  const response = await fetcher(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`股票基础资料查询失败：${response.status}`);
  }

  const payload = (await response.json()) as EastmoneyStockResponse;
  const data = payload.data;
  const code = normalizeText(data?.f57);
  const shortName = normalizeText(data?.f58);
  if (!data || !code || !shortName) {
    throw new Error("未查询到股票基础资料");
  }

  const industry = normalizeText(data.f127);
  const board = inferBoard(code);

  return {
    stockCode: code,
    shortName,
    board,
    industry,
    region: "",
    marketCapBand: formatMarketCapBand(toNumber(data.f116)),
    intro: buildIntro(shortName, industry, board),
    mainBusiness: industry,
    source: "eastmoney",
    sourceDetail: "东方财富 push2 基础资料",
  };
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined || value === "-") return "";
  return String(value).trim();
}

function normalizeQuery(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function getStockIndexItems(options: StockLookupOptions) {
  if (options.stockIndexItems) return options.stockIndexItems.filter(isStockIndexTuple);
  if (cachedStockIndex) return cachedStockIndex;

  const stockIndexPath = resolveStockIndexPath(options.stockIndexPath);
  if (!stockIndexPath) {
    cachedStockIndex = [];
    return cachedStockIndex;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(stockIndexPath, "utf8")) as unknown;
    cachedStockIndex = Array.isArray(payload) ? payload.filter(isStockIndexTuple) : [];
  } catch {
    cachedStockIndex = [];
  }

  return cachedStockIndex;
}

function resolveStockIndexPath(explicitPath?: string) {
  const homeDir = process.env.HOME ?? "";
  const candidates = [
    explicitPath,
    process.env.STOCK_CLASSIFICATION_STOCK_INDEX_PATH,
    path.join(process.cwd(), "data", "stocks.index.json"),
    path.join(homeDir, "DevProjs", "DA-Stock", "data", "cache", "stocks.index.json"),
    path.join(homeDir, "DevProjs", "DA-Stock", "apps", "dsa-web", "public", "stocks.index.json"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function isStockIndexTuple(item: unknown): item is StockIndexTuple {
  return (
    Array.isArray(item) &&
    item.length >= 10 &&
    typeof item[0] === "string" &&
    typeof item[1] === "string" &&
    typeof item[2] === "string" &&
    typeof item[3] === "string" &&
    typeof item[4] === "string" &&
    Array.isArray(item[5]) &&
    typeof item[6] === "string" &&
    typeof item[7] === "string" &&
    typeof item[8] === "boolean" &&
    typeof item[9] === "number"
  );
}

function isCnStockItem(item: StockIndexTuple) {
  return item[6] === "CN" && item[7] === "stock" && item[8] === true && A_SHARE_CODE_PATTERN.test(item[1]);
}

function calculateStockIndexScore(query: string, item: StockIndexTuple) {
  const canonicalCode = normalizeQuery(item[0]);
  const displayCode = normalizeQuery(item[1]);
  const nameZh = normalizeQuery(item[2]);
  const pinyinFull = normalizeQuery(item[3]);
  const pinyinAbbr = normalizeQuery(item[4]);
  const aliases = item[5].filter((alias): alias is string => typeof alias === "string").map(normalizeQuery);

  if (query === canonicalCode) return 100;
  if (query === displayCode) return 99;
  if (query === nameZh) return 98;
  if (aliases.some((alias) => alias === query)) return 97;
  if (query === pinyinAbbr) return 96;

  let score = 0;
  if (displayCode.startsWith(query)) score = Math.max(score, 80);
  if (nameZh.startsWith(query)) score = Math.max(score, 79);
  if (pinyinAbbr.startsWith(query)) score = Math.max(score, 78);
  if (aliases.some((alias) => alias.startsWith(query))) score = Math.max(score, 77);
  if (displayCode.includes(query)) score = Math.max(score, 60);
  if (nameZh.includes(query)) score = Math.max(score, 59);
  if (pinyinFull.includes(query)) score = Math.max(score, 58);
  if (aliases.some((alias) => alias.includes(query))) score = Math.max(score, 57);
  return score;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatMarketCapBand(marketCapYuan: number) {
  if (marketCapYuan <= 0) return "";
  const marketCapYi = marketCapYuan / 100_000_000;
  if (marketCapYi < 50) return "<50亿";
  if (marketCapYi < 100) return "50-100亿";
  if (marketCapYi < 300) return "100-300亿";
  if (marketCapYi < 1000) return "300-1000亿";
  return ">1000亿";
}

function buildIntro(shortName: string, industry: string, board: string) {
  const fragments = [`东财基础资料显示，${shortName}`];
  if (industry) fragments.push(`属于${industry}行业`);
  if (board) fragments.push(`上市板块为${board}`);
  if (fragments.length === 1) return `${fragments[0]}。`;
  return `${fragments[0]}${fragments.slice(1).join("，")}。`;
}
