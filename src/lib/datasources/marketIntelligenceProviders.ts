export type MarketIntelligenceFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type TencentQuoteFacts = {
  quoteName: string;
  price: number | null;
  previousClose: number | null;
  changePercent: number | null;
  turnoverPercent: number | null;
  peTtm: number | null;
  pb: number | null;
  totalMarketCapYi: number | null;
  circulatingMarketCapYi: number | null;
  limitUp: number | null;
  limitDown: number | null;
};

export type AnnouncementFact = {
  title: string;
  type: string;
  date: string;
  url: string;
};

export type ResearchReportFact = {
  title: string;
  publishDate: string;
  organization: string;
  rating: string;
  industry: string;
  predictedEps: {
    currentYear: number | null;
    nextYear: number | null;
    nextTwoYears: number | null;
  };
  pdfUrl: string;
};

type CninfoResponse = {
  announcements?: Array<{
    announcementId?: string;
    announcementTitle?: string;
    announcementTypeName?: string;
    announcementTime?: string | number;
  }> | null;
};

type EastmoneyReportResponse = {
  data?: Array<{
    title?: string;
    publishDate?: string;
    orgSName?: string;
    infoCode?: string;
    predictThisYearEps?: string | number;
    predictNextYearEps?: string | number;
    predictNextTwoYearEps?: string | number;
    emRatingName?: string;
    indvInduName?: string;
  }> | null;
};

const TENCENT_QUOTE_URL = "https://qt.gtimg.cn/q=";
const CNINFO_ANNOUNCEMENTS_URL = "https://www.cninfo.com.cn/new/hisAnnouncement/query";
const EASTMONEY_REPORTS_URL = "https://reportapi.eastmoney.com/report/list";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export async function fetchTencentQuoteFacts(
  stockCode: string,
  fetcher: MarketIntelligenceFetcher,
): Promise<TencentQuoteFacts> {
  const response = await fetcher(`${TENCENT_QUOTE_URL}${marketPrefix(stockCode)}${stockCode}`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`腾讯估值查询失败：${response.status}`);

  const text = new TextDecoder("gbk").decode(await response.arrayBuffer());
  const quoted = text.match(/"([^"]*)"/)?.[1] ?? "";
  const values = quoted.split("~");
  if (values.length < 53 || values[2] !== stockCode) {
    throw new Error("腾讯估值未返回有效股票数据");
  }

  return {
    quoteName: normalizeText(values[1]),
    price: nullableNumber(values[3]),
    previousClose: nullableNumber(values[4]),
    changePercent: nullableNumber(values[32]),
    turnoverPercent: nullableNumber(values[38]),
    peTtm: nullableNumber(values[39]),
    totalMarketCapYi: nullableNumber(values[44]),
    circulatingMarketCapYi: nullableNumber(values[45]),
    pb: nullableNumber(values[46]),
    limitUp: nullableNumber(values[47]),
    limitDown: nullableNumber(values[48]),
  };
}

export async function fetchCninfoAnnouncements(
  stockCode: string,
  fetcher: MarketIntelligenceFetcher,
): Promise<AnnouncementFact[]> {
  const body = new URLSearchParams({
    stock: `${stockCode},${cninfoOrgId(stockCode)}`,
    tabName: "fulltext",
    pageSize: "20",
    pageNum: "1",
    column: "",
    category: "",
    plate: "",
    seDate: "",
    searchkey: "",
    secid: "",
    sortName: "",
    sortType: "",
    isHLtitle: "true",
  });
  const response = await fetcher(CNINFO_ANNOUNCEMENTS_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://www.cninfo.com.cn/new/disclosure",
      Origin: "https://www.cninfo.com.cn",
    },
    body,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`巨潮公告查询失败：${response.status}`);

  const payload = (await response.json()) as CninfoResponse;
  return (payload.announcements ?? []).slice(0, 20).map((item) => ({
    title: stripHtml(item.announcementTitle),
    type: normalizeText(item.announcementTypeName),
    date: normalizeDate(item.announcementTime),
    url: item.announcementId
      ? `https://www.cninfo.com.cn/new/disclosure/detail?annoId=${encodeURIComponent(item.announcementId)}`
      : "",
  })).filter((item) => item.title);
}

export async function fetchEastmoneyResearchReports(
  stockCode: string,
  fetcher: MarketIntelligenceFetcher,
): Promise<ResearchReportFact[]> {
  const url = new URL(EASTMONEY_REPORTS_URL);
  const params: Record<string, string> = {
    industryCode: "*",
    pageSize: "20",
    industry: "*",
    rating: "*",
    ratingChange: "*",
    beginTime: "2000-01-01",
    endTime: "2030-01-01",
    pageNo: "1",
    fields: "",
    qType: "0",
    orgCode: "",
    code: stockCode,
    rcode: "",
    p: "1",
    pageNum: "1",
    pageNumber: "1",
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetcher(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Referer: "https://data.eastmoney.com/",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`东财研报查询失败：${response.status}`);

  const payload = (await response.json()) as EastmoneyReportResponse;
  return (payload.data ?? []).slice(0, 20).map((item) => ({
    title: normalizeText(item.title),
    publishDate: normalizeDate(item.publishDate),
    organization: normalizeText(item.orgSName),
    rating: normalizeText(item.emRatingName),
    industry: normalizeText(item.indvInduName),
    predictedEps: {
      currentYear: nullableNumber(item.predictThisYearEps),
      nextYear: nullableNumber(item.predictNextYearEps),
      nextTwoYears: nullableNumber(item.predictNextTwoYearEps),
    },
    pdfUrl: item.infoCode ? `https://pdf.dfcfw.com/pdf/H3_${encodeURIComponent(item.infoCode)}_1.pdf` : "",
  })).filter((item) => item.title);
}

export function cninfoOrgId(stockCode: string) {
  if (stockCode.startsWith("6")) return `gssh0${stockCode}`;
  if (stockCode.startsWith("8") || stockCode.startsWith("4") || stockCode.startsWith("92")) return `gsbj0${stockCode}`;
  return `gssz0${stockCode}`;
}

function marketPrefix(stockCode: string) {
  if (stockCode.startsWith("92")) return "bj";
  if (stockCode.startsWith("6") || stockCode.startsWith("9")) return "sh";
  if (stockCode.startsWith("8") || stockCode.startsWith("4")) return "bj";
  return "sz";
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: unknown) {
  if (typeof value === "number") return new Date(value).toISOString().slice(0, 10);
  const text = normalizeText(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function normalizeText(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function stripHtml(value: unknown) {
  return normalizeText(value).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
