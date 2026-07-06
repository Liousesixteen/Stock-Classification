type StockLookupFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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

export async function lookupStockProfile(stockCode: string, fetcher: StockLookupFetcher = fetch): Promise<StockLookupProfile> {
  const normalizedCode = stockCode.trim();
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
