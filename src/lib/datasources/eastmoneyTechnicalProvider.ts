export type TechnicalSnapshot = {
  stockCode: string;
  securityName?: string;
  source: "eastmoney_kline" | "tencent_kline";
  sourceUrl: string;
  fetchedAt: string;
  recordCount: number;
  latestDate: string;
  latest: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    turnoverPercent: number | null;
  };
  ma: { ma5: number | null; ma10: number | null; ma20: number | null; ma60: number | null };
  ma20Slope5dPercent: number | null;
  bias: { ma5: number | null; ma10: number | null; ma20: number | null };
  macd: { dif: number | null; dea: number | null; histogram: number | null };
  rsi6: number | null;
  volumeRatio5: number | null;
  support20: number | null;
  resistance20: number | null;
  change20Percent: number | null;
  recentBars: Array<{ date: string; open: number; close: number; high: number; low: number; volume: number }>;
};

export type MarketTechnicalSnapshotResult = {
  snapshots: TechnicalSnapshot[];
  failures: Array<{ code: string; name: string; error: string }>;
  fetchedAt: string;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type KlinePayload = { data?: { klines?: string[] | null } | null };
type Bar = { date: string; open: number; close: number; high: number; low: number; volume: number; turnoverPercent: number | null };

export async function fetchEastmoneyTechnicalSnapshot(
  stockCode: string,
  fetcher: Fetcher = fetch,
  days = 140,
  options: { market?: 0 | 1; securityName?: string } = {},
): Promise<TechnicalSnapshot> {
  try {
    return await fetchEastmoneyTechnicalSnapshotPrimary(stockCode, fetcher, days, options);
  } catch (eastmoneyError) {
    try {
      return await fetchTencentTechnicalSnapshot(stockCode, fetcher, days, options);
    } catch (tencentError) {
      throw new Error(
        `历史日线数据不可用（东财：${publicError(eastmoneyError)}；腾讯：${publicError(tencentError)}）`,
      );
    }
  }
}

async function fetchEastmoneyTechnicalSnapshotPrimary(
  stockCode: string,
  fetcher: Fetcher,
  days: number,
  options: { market?: 0 | 1; securityName?: string },
): Promise<TechnicalSnapshot> {
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  const market = options.market ?? (stockCode.startsWith("6") || stockCode.startsWith("9") ? 1 : 0);
  url.searchParams.set("secid", `${market}.${stockCode}`);
  url.searchParams.set("klt", "101");
  url.searchParams.set("fqt", "1");
  url.searchParams.set("lmt", String(Math.max(20, Math.min(days, 260))));
  url.searchParams.set("end", "20500101");
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  url.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61");

  const response = await fetcher(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://quote.eastmoney.com/",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`东财日线查询失败：${response.status}`);
  const payload = await response.json() as KlinePayload;
  const bars = (payload.data?.klines ?? []).map(parseBar).filter((bar): bar is Bar => Boolean(bar));
  if (bars.length < 20) throw new Error("东财日线数据不足");

  return buildTechnicalSnapshot({
    stockCode,
    securityName: options.securityName,
    source: "eastmoney_kline",
    sourceUrl: url.toString(),
    bars,
  });
}

type TencentKlinePayload = {
  code?: number;
  data?: Record<string, { day?: string[][]; qfqday?: string[][] }>;
};

async function fetchTencentTechnicalSnapshot(
  stockCode: string,
  fetcher: Fetcher,
  days: number,
  options: { market?: 0 | 1; securityName?: string },
): Promise<TechnicalSnapshot> {
  const market = options.market ?? (stockCode.startsWith("6") || stockCode.startsWith("9") ? 1 : 0);
  const symbol = `${market === 1 ? "sh" : "sz"}${stockCode}`;
  const limit = Math.max(20, Math.min(days, 260));
  const url = new URL("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get");
  url.searchParams.set("param", `${symbol},day,,,${limit},qfq`);
  const response = await fetcher(url, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://gu.qq.com/" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`腾讯日线查询失败：${response.status}`);
  const payload = await response.json() as TencentKlinePayload;
  const node = payload.data?.[symbol];
  const rawBars = node?.qfqday ?? node?.day ?? [];
  const bars = rawBars.map(parseTencentBar).filter((bar): bar is Bar => Boolean(bar));
  if (bars.length < 20) throw new Error("腾讯日线数据不足");
  return buildTechnicalSnapshot({
    stockCode,
    securityName: options.securityName,
    source: "tencent_kline",
    sourceUrl: url.toString(),
    bars,
  });
}

function buildTechnicalSnapshot(input: {
  stockCode: string;
  securityName?: string;
  source: TechnicalSnapshot["source"];
  sourceUrl: string;
  bars: Bar[];
}): TechnicalSnapshot {
  const { bars } = input;
  const closes = bars.map((bar) => bar.close);
  const volumes = bars.map((bar) => bar.volume);
  const latest = bars.at(-1)!;
  const ma5 = averageTail(closes, 5);
  const ma10 = averageTail(closes, 10);
  const ma20 = averageTail(closes, 20);
  const ma60 = averageTail(closes, 60);
  const last20 = bars.slice(-20);
  const first20Close = last20[0]?.close ?? 0;
  return {
    stockCode: input.stockCode,
    securityName: input.securityName,
    source: input.source,
    sourceUrl: input.sourceUrl,
    fetchedAt: new Date().toISOString(),
    recordCount: bars.length,
    latestDate: latest.date,
    latest: { ...latest },
    ma: { ma5, ma10, ma20, ma60 },
    ma20Slope5dPercent: percentDifference(ma20 ?? 0, averageTail(closes.slice(0, -5), 20)),
    bias: {
      ma5: percentDifference(latest.close, ma5),
      ma10: percentDifference(latest.close, ma10),
      ma20: percentDifference(latest.close, ma20),
    },
    macd: calculateMacd(closes),
    rsi6: calculateRsi(closes, 6),
    volumeRatio5: ratio(latest.volume, averageTail(volumes, 5)),
    support20: round(Math.min(...last20.map((bar) => bar.low))),
    resistance20: round(Math.max(...last20.map((bar) => bar.high))),
    change20Percent: percentDifference(latest.close, first20Close),
    recentBars: bars.slice(-60).map(({ date, open, close, high, low, volume }) => ({ date, open, close, high, low, volume })),
  };
}

const A_SHARE_INDEXES = [
  { code: "000001", name: "上证指数", market: 1 as const },
  { code: "399001", name: "深证成指", market: 0 as const },
  { code: "399006", name: "创业板指", market: 0 as const },
  { code: "000300", name: "沪深300", market: 1 as const },
];

export async function fetchEastmoneyMarketTechnicalSnapshots(
  fetcher: Fetcher = fetch,
  days = 140,
): Promise<MarketTechnicalSnapshotResult> {
  const results = await Promise.allSettled(A_SHARE_INDEXES.map((index) =>
    fetchEastmoneyTechnicalSnapshot(index.code, fetcher, days, {
      market: index.market,
      securityName: index.name,
    }),
  ));
  const snapshots: TechnicalSnapshot[] = [];
  const failures: MarketTechnicalSnapshotResult["failures"] = [];
  results.forEach((result, index) => {
    const target = A_SHARE_INDEXES[index];
    if (result.status === "fulfilled") snapshots.push(result.value);
    else failures.push({ code: target.code, name: target.name, error: publicError(result.reason) });
  });
  if (!snapshots.length) throw new Error("主要指数日线数据均不可用");
  return { snapshots, failures, fetchedAt: new Date().toISOString() };
}

function publicError(reason: unknown) {
  return reason instanceof Error ? reason.message.slice(0, 160) : "数据源请求失败";
}

function parseBar(value: string): Bar | null {
  const fields = value.split(",");
  if (fields.length < 6) return null;
  const [date, open, close, high, low, volume] = fields;
  const numbers = [open, close, high, low, volume].map(Number);
  if (numbers.some((item) => !Number.isFinite(item))) return null;
  const turnover = Number(fields[10]);
  return {
    date,
    open: numbers[0],
    close: numbers[1],
    high: numbers[2],
    low: numbers[3],
    volume: numbers[4],
    turnoverPercent: Number.isFinite(turnover) ? turnover : null,
  };
}

function parseTencentBar(fields: string[]): Bar | null {
  if (fields.length < 6) return null;
  const [date, open, close, high, low, volume] = fields;
  const numbers = [open, close, high, low, volume].map(Number);
  if (!date || numbers.some((item) => !Number.isFinite(item))) return null;
  return {
    date,
    open: numbers[0],
    close: numbers[1],
    high: numbers[2],
    low: numbers[3],
    volume: numbers[4],
    turnoverPercent: null,
  };
}

function averageTail(values: number[], count: number) {
  if (values.length < count) return null;
  return round(values.slice(-count).reduce((sum, value) => sum + value, 0) / count);
}

function calculateMacd(values: number[]) {
  if (values.length < 26) return { dif: null, dea: null, histogram: null };
  const ema12 = emaSeries(values, 12);
  const ema26 = emaSeries(values, 26);
  const difSeries = values.map((_, index) => ema12[index] - ema26[index]);
  const deaSeries = emaSeries(difSeries, 9);
  const dif = difSeries.at(-1)!;
  const dea = deaSeries.at(-1)!;
  return { dif: round(dif, 4), dea: round(dea, 4), histogram: round((dif - dea) * 2, 4) };
}

function emaSeries(values: number[], period: number) {
  const alpha = 2 / (period + 1);
  return values.reduce<number[]>((rows, value, index) => {
    rows.push(index === 0 ? value : value * alpha + rows[index - 1] * (1 - alpha));
    return rows;
  }, []);
}

function calculateRsi(values: number[], period: number) {
  if (values.length <= period) return null;
  const changes = values.slice(-(period + 1)).slice(1).map((value, index) => value - values.slice(-(period + 1))[index]);
  const gains = changes.reduce((sum, value) => sum + Math.max(0, value), 0) / period;
  const losses = changes.reduce((sum, value) => sum + Math.max(0, -value), 0) / period;
  if (losses === 0) return 100;
  return round(100 - 100 / (1 + gains / losses));
}

function percentDifference(value: number, baseline: number | null) {
  return baseline ? round((value - baseline) / baseline * 100) : null;
}

function ratio(value: number, baseline: number | null) {
  return baseline ? round(value / baseline) : null;
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
