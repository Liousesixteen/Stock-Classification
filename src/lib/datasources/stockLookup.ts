import fs from "node:fs";
import path from "node:path";
import {
  getStockProfileProviderCacheTtlMs,
  getStockProfileProviderConfidence,
  getStockProfileProviderLabel,
  getStockProfileProviderPlan,
  isStockProfileProviderEnabled,
  type StockProfileProvider,
  type StockProfileProviderId,
} from "./providerPlan";
import {
  fetchCninfoAnnouncements,
  fetchEastmoneyResearchReports,
  fetchTencentQuoteFacts,
} from "./marketIntelligenceProviders";
import {
  balanceSheetFacts,
  cashFlowFacts,
  fetchSinaFinancialStatement,
  incomeStatementFacts,
} from "./sinaFinancialStatements";
import {
  stockProviderCircuitBreaker,
  type ProviderCircuitState,
} from "./providerCircuitBreaker";

export type StockLookupFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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

export type StockLookupOptions = {
  providerOrder?: string[];
  providerTimeoutMs?: number;
  stockIndexItems?: unknown[];
  stockIndexPath?: string;
};

type RelatedBlockEntry = {
  name: string;
  desc: string;
};

type RelatedBlocks = {
  industry: RelatedBlockEntry[];
  concept: RelatedBlockEntry[];
  region: RelatedBlockEntry[];
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

type EastmoneyCompanySurveyResponse = {
  jbzl?: {
    gsmc?: string;
    qy?: string;
    sshy?: string;
    sszjhhy?: string;
    gsjj?: string;
    jyfw?: string;
  };
};

type EastmoneyBusinessAnalysisResponse = {
  zyfw?: Array<{
    BUSINESS_SCOPE?: string;
  }>;
  zygcfx?: Array<{
    REPORT_DATE?: string;
    MAINOP_TYPE?: string;
    ITEM_NAME?: string;
    MAIN_BUSINESS_INCOME?: number | string;
    MBI_RATIO?: number | string;
    MAIN_BUSINESS_COST?: number | string;
    MAIN_BUSINESS_RPOFIT?: number | string;
    GROSS_RPOFIT_RATIO?: number | string;
    RANK?: number | string;
  }>;
  jyps?: Array<{
    REPORT_DATE?: string;
    BUSINESS_REVIEW?: string;
  }>;
};

type BaiduRelatedBlockResponse = {
  ResultCode?: string | number;
  Result?: Array<{
    type?: string;
    list?: Array<{
      name?: string;
      desc?: string;
      increase?: string | number;
    }>;
  }>;
};

export type StockLookupProfile = {
  stockCode: string;
  shortName: string;
  fullName: string;
  board: string;
  industry: string;
  region: string;
  marketCapBand: string;
  intro: string;
  mainBusiness: string;
  businessScope: string;
  businessReview: string;
  concepts: string[];
  industryBlocks: string[];
  mainProducts: string[];
  sourceFacts: string[];
  source: "eastmoney" | "local_index";
  sourceDetail: string;
};

export type StockLookupProviderTrace = {
  provider: StockProfileProviderId;
  providerLabel: string;
  required: boolean;
  status: "success" | "failed" | "skipped";
  facts: Record<string, unknown>;
  expectedFields: string[];
  sourceUrl: string;
  confidence: "high" | "medium" | "low";
  cacheTtlMs: number;
  fetchedAt: string;
  error: string;
  durationMs: number;
  circuitState?: ProviderCircuitState;
};

export type StockLookupWithTrace = {
  profile: StockLookupProfile;
  traces: StockLookupProviderTrace[];
};

const EASTMONEY_STOCK_URL = "https://push2.eastmoney.com/api/qt/stock/get";
const EASTMONEY_COMPANY_SURVEY_URL = "https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/CompanySurveyAjax";
const EASTMONEY_BUSINESS_ANALYSIS_URL = "https://emweb.securities.eastmoney.com/PC_HSF10/BusinessAnalysis/PageAjax";
const EASTMONEY_FIELDS = ["f57", "f58", "f116", "f117", "f127", "f189"].join(",");
const BAIDU_RELATED_BLOCK_URL = "https://finance.pae.baidu.com/api/getrelatedblock";
const A_SHARE_CODE_PATTERN = /^(00|30|60|68|83|87|92)\d{4}$/;
let cachedStockIndex: StockIndexTuple[] | undefined;

export function eastmoneySecId(stockCode: string) {
  return stockCode.startsWith("6") ? `1.${stockCode}` : `0.${stockCode}`;
}

export function inferBoard(stockCode: string) {
  if (stockCode.startsWith("688") || stockCode.startsWith("689")) return "科创板";
  if (stockCode.startsWith("30")) return "创业板";
  if (stockCode.startsWith("60")) return "沪市主板";
  if (stockCode.startsWith("00")) return "深市主板";
  if (stockCode.startsWith("83") || stockCode.startsWith("87") || stockCode.startsWith("92")) return "北交所";
  return "";
}

export function resolveStockQuery(query: string, options: StockLookupOptions = {}): ResolvedStock | undefined {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return undefined;

  if (A_SHARE_CODE_PATTERN.test(normalizedQuery)) {
    const exactIndexItem = getStockIndexItems(options).find(
      (item) => isCnStockItem(item) && normalizeQuery(item[1]) === normalizedQuery,
    );
    return {
      canonicalCode: exactIndexItem?.[0] ?? `${normalizedQuery}.${normalizedQuery.startsWith("6") ? "SH" : "SZ"}`,
      displayCode: normalizedQuery,
      nameZh: exactIndexItem?.[2] ?? "",
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

export function resolveStockMention(value: string, options: StockLookupOptions = {}): ResolvedStock | undefined {
  const normalizedValue = normalizeQuery(value);
  if (!normalizedValue) return undefined;
  const direct = resolveStockQuery(normalizedValue, options);
  if (direct) return direct;

  const matches = getStockIndexItems(options).flatMap((item) => {
    if (!isCnStockItem(item)) return [];
    const tokens = [item[2], ...item[5]]
      .filter((token): token is string => typeof token === "string")
      .map(normalizeQuery)
      .filter((token) => token.length >= 2 && normalizedValue.includes(token));
    const matchedLength = Math.max(0, ...tokens.map((token) => token.length));
    return matchedLength ? [{ item, matchedLength }] : [];
  }).sort((left, right) =>
    right.matchedLength - left.matchedLength || right.item[9] - left.item[9],
  );

  if (!matches[0]) return undefined;
  if (new Set(matches.map((match) => match.item[1])).size > 1) return undefined;
  return {
    canonicalCode: matches[0].item[0],
    displayCode: matches[0].item[1],
    nameZh: matches[0].item[2],
  };
}

export function lookupFastStockProfile(query: string, options: StockLookupOptions = {}): StockLookupProfile {
  const resolvedStock = resolveStockQuery(query, options);
  if (!resolvedStock) {
    throw new Error("未匹配到 A 股股票");
  }

  const shortName = resolvedStock.nameZh || resolvedStock.displayCode;
  const board = inferBoard(resolvedStock.displayCode);

  return {
    stockCode: resolvedStock.displayCode,
    shortName,
    fullName: "",
    board,
    industry: "",
    region: "",
    marketCapBand: "",
    intro: shortName === resolvedStock.displayCode ? "" : `本地股票索引匹配到 ${shortName}。`,
    mainBusiness: "",
    businessScope: "",
    businessReview: "",
    concepts: [],
    industryBlocks: [],
    mainProducts: [],
    sourceFacts: [`代码：${resolvedStock.displayCode}`, `简称：${shortName}`, board ? `上市板块：${board}` : "", "数据源：本地股票索引"].filter(
      Boolean,
    ),
    source: "local_index",
    sourceDetail: "本地股票索引",
  };
}

export async function lookupStockProfile(
  query: string,
  fetcher: StockLookupFetcher = fetch,
  options: StockLookupOptions = {},
): Promise<StockLookupProfile> {
  return (await lookupStockProfileWithTrace(query, fetcher, options)).profile;
}

export async function lookupStockProfileWithTrace(
  query: string,
  fetcher: StockLookupFetcher = fetch,
  options: StockLookupOptions = {},
): Promise<StockLookupWithTrace> {
  const resolvedStock = resolveStockQuery(query, options);
  if (!resolvedStock) {
    throw new Error("未匹配到 A 股股票");
  }

  const providerPlan = getStockProfileProviderPlan({ providerOrder: options.providerOrder });
  const normalizedCode = resolvedStock.displayCode;
  const providerTimeoutMs = Math.max(options.providerTimeoutMs ?? 3_500, 250);
  const providerFetcher: StockLookupFetcher = (input, init) => fetcher(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(providerTimeoutMs),
  });
  const basicFallback: EastmoneyStockData = {
    f57: resolvedStock.displayCode,
    f58: resolvedStock.nameZh || resolvedStock.displayCode,
  };

  const basicsResult = await runProvider({
    provider: getProvider(providerPlan, "eastmoney_push2"),
    enabled: isStockProfileProviderEnabled(providerPlan, "eastmoney_push2"),
    fallback: basicFallback,
    failOpen: true,
    timeoutMs: providerTimeoutMs,
    sourceUrl: buildProviderSourceUrl("eastmoney_push2", normalizedCode),
    expectedFields: ["stockCode", "shortName", "industry", "totalMarketCap", "circulatingMarketCap", "listingDate"],
    task: () => fetchEastmoneyStockBasics(normalizedCode, providerFetcher),
    toFacts: (data) => ({
      stockCode: normalizeText(data.f57),
      shortName: normalizeText(data.f58),
      industry: normalizeText(data.f127),
      totalMarketCap: toNumber(data.f116),
      circulatingMarketCap: toNumber(data.f117),
      listingDate: normalizeText(data.f189),
    }),
  });
  const data = basicsResult.value;
  const code = normalizeText(data.f57);
  const shortName = normalizeText(data.f58);

  const eastmoneyIndustry = normalizeText(data.f127);
  const board = inferBoard(code);
  const [
    relatedBlocksResult,
    companySurveyResult,
    businessAnalysisResult,
    tencentQuoteResult,
    announcementsResult,
    researchReportsResult,
    incomeStatementResult,
    balanceSheetResult,
    cashFlowResult,
  ] = await Promise.all([
    runProvider({
      provider: getProvider(providerPlan, "baidu_related_blocks"),
      enabled: isStockProfileProviderEnabled(providerPlan, "baidu_related_blocks"),
      fallback: emptyRelatedBlocks(),
      timeoutMs: providerTimeoutMs,
      sourceUrl: buildProviderSourceUrl("baidu_related_blocks", code),
      expectedFields: ["industry", "concepts", "region"],
      task: () => fetchBaiduRelatedBlocks(code, providerFetcher),
      toFacts: (blocks) => ({
        industry: uniqueNames(blocks.industry),
        concepts: uniqueNames(blocks.concept),
        region: uniqueNames(blocks.region),
      }),
    }),
    runProvider({
      provider: getProvider(providerPlan, "eastmoney_f10_company_survey"),
      enabled: isStockProfileProviderEnabled(providerPlan, "eastmoney_f10_company_survey"),
      fallback: {} as EastmoneyCompanySurveyResponse,
      timeoutMs: providerTimeoutMs,
      sourceUrl: buildProviderSourceUrl("eastmoney_f10_company_survey", code),
      expectedFields: ["fullName", "region", "industry", "intro", "businessScope"],
      task: () => fetchEastmoneyCompanySurvey(code, providerFetcher),
      toFacts: (survey) => ({
        fullName: normalizeText(survey.jbzl?.gsmc),
        region: normalizeText(survey.jbzl?.qy),
        industry: normalizeText(survey.jbzl?.sshy) || normalizeText(survey.jbzl?.sszjhhy),
        intro: compactText(survey.jbzl?.gsjj, 320),
        businessScope: compactText(survey.jbzl?.jyfw, 360),
      }),
    }),
    runProvider({
      provider: getProvider(providerPlan, "eastmoney_f10_business_analysis"),
      enabled: isStockProfileProviderEnabled(providerPlan, "eastmoney_f10_business_analysis"),
      fallback: {} as EastmoneyBusinessAnalysisResponse,
      timeoutMs: providerTimeoutMs,
      sourceUrl: buildProviderSourceUrl("eastmoney_f10_business_analysis", code),
      expectedFields: ["businessScope", "businessReview", "mainProducts", "businessComposition"],
      task: () => fetchEastmoneyBusinessAnalysis(code, providerFetcher),
      toFacts: (analysis) => ({
        businessScope: compactText(analysis.zyfw?.[0]?.BUSINESS_SCOPE, 360),
        businessReview: compactText(getLatestBusinessReview(analysis), 520),
        mainProducts: getLatestMainProducts(analysis),
        businessComposition: getLatestBusinessComposition(analysis),
      }),
    }),
    runProvider({
      provider: getProvider(providerPlan, "tencent_quote"),
      enabled: isStockProfileProviderEnabled(providerPlan, "tencent_quote"),
      fallback: null,
      timeoutMs: providerTimeoutMs,
      sourceUrl: buildProviderSourceUrl("tencent_quote", code),
      expectedFields: [
        "price",
        "previousClose",
        "changePercent",
        "turnoverPercent",
        "peTtm",
        "pb",
        "totalMarketCapYi",
        "circulatingMarketCapYi",
        "limitUp",
        "limitDown",
      ],
      task: () => fetchTencentQuoteFacts(code, providerFetcher),
      toFacts: (quote) => quote ?? {},
    }),
    runProvider({
      provider: getProvider(providerPlan, "cninfo_announcements"),
      enabled: isStockProfileProviderEnabled(providerPlan, "cninfo_announcements"),
      fallback: [],
      timeoutMs: providerTimeoutMs,
      sourceUrl: buildProviderSourceUrl("cninfo_announcements", code),
      expectedFields: ["announcements"],
      task: () => fetchCninfoAnnouncements(code, providerFetcher),
      toFacts: (announcements) => ({ announcements }),
    }),
    runProvider({
      provider: getProvider(providerPlan, "eastmoney_reports"),
      enabled: isStockProfileProviderEnabled(providerPlan, "eastmoney_reports"),
      fallback: [],
      timeoutMs: providerTimeoutMs,
      sourceUrl: buildProviderSourceUrl("eastmoney_reports", code),
      expectedFields: ["researchReports"],
      task: () => fetchEastmoneyResearchReports(code, providerFetcher),
      toFacts: (researchReports) => ({ researchReports }),
    }),
    runProvider({
      provider: getProvider(providerPlan, "sina_income_statement"),
      enabled: isStockProfileProviderEnabled(providerPlan, "sina_income_statement"),
      fallback: [],
      timeoutMs: providerTimeoutMs,
      sourceUrl: buildProviderSourceUrl("sina_income_statement", code),
      expectedFields: ["incomeStatements", "financialReportDate", "revenue", "revenueYoY", "netProfit", "netProfitYoY", "basicEps"],
      task: () => fetchSinaFinancialStatement(code, "lrb", providerFetcher),
      toFacts: incomeStatementFacts,
    }),
    runProvider({
      provider: getProvider(providerPlan, "sina_balance_sheet"),
      enabled: isStockProfileProviderEnabled(providerPlan, "sina_balance_sheet"),
      fallback: [],
      timeoutMs: providerTimeoutMs,
      sourceUrl: buildProviderSourceUrl("sina_balance_sheet", code),
      expectedFields: ["balanceSheets", "financialReportDate", "totalAssets", "totalLiabilities", "parentEquity", "debtRatio"],
      task: () => fetchSinaFinancialStatement(code, "fzb", providerFetcher),
      toFacts: balanceSheetFacts,
    }),
    runProvider({
      provider: getProvider(providerPlan, "sina_cash_flow"),
      enabled: isStockProfileProviderEnabled(providerPlan, "sina_cash_flow"),
      fallback: [],
      timeoutMs: providerTimeoutMs,
      sourceUrl: buildProviderSourceUrl("sina_cash_flow", code),
      expectedFields: ["cashFlowStatements", "financialReportDate", "operatingCashFlow", "operatingCashFlowYoY"],
      task: () => fetchSinaFinancialStatement(code, "llb", providerFetcher),
      toFacts: cashFlowFacts,
    }),
  ]);
  const relatedBlocks = relatedBlocksResult.value;
  const companySurvey = companySurveyResult.value;
  const businessAnalysis = businessAnalysisResult.value;
  const concepts = uniqueNames(relatedBlocks.concept);
  const industryBlocks = uniqueNames(relatedBlocks.industry);
  const regionBlocks = uniqueNames(relatedBlocks.region);
  const f10Industry = normalizeText(companySurvey.jbzl?.sshy) || normalizeText(companySurvey.jbzl?.sszjhhy);
  const industry = f10Industry || eastmoneyIndustry;
  const fullName = normalizeText(companySurvey.jbzl?.gsmc);
  const region = regionBlocks[0] ?? normalizeText(companySurvey.jbzl?.qy);
  const companyIntro = compactText(companySurvey.jbzl?.gsjj, 320);
  const businessScope = compactText(businessAnalysis.zyfw?.[0]?.BUSINESS_SCOPE || companySurvey.jbzl?.jyfw, 360);
  const businessReview = compactText(getLatestBusinessReview(businessAnalysis), 520);
  const mainProducts = getLatestMainProducts(businessAnalysis);
  const sourceDetail = [
    basicsResult.trace.status === "success"
      ? getStockProfileProviderLabel("eastmoney_push2")
      : "本地股票索引",
    fullName || companyIntro ? getStockProfileProviderLabel("eastmoney_f10_company_survey") : "",
    businessScope || businessReview || mainProducts.length > 0 ? getStockProfileProviderLabel("eastmoney_f10_business_analysis") : "",
    relatedBlocksHasAny(relatedBlocks) ? getStockProfileProviderLabel("baidu_related_blocks") : "",
  ]
    .filter(Boolean)
    .join("；");
  const intro = buildIntro(
    shortName,
    industry,
    board,
    concepts,
    region,
    companyIntro,
    basicsResult.trace.status === "success" ? "东财基础资料" : "本地股票索引",
  );
  const mainBusiness = buildMainBusiness(industry, industryBlocks, concepts, region, businessScope, businessReview, mainProducts);
  const sourceFacts = buildProfileSourceFacts({
    code,
    shortName,
    fullName,
    industry,
    board,
    marketCapBand: formatMarketCapBand(toNumber(data.f116)),
    concepts,
    industryBlocks,
    region,
    businessScope,
    businessReview,
    mainProducts,
    sourceDetail,
  });

  return {
    profile: {
      stockCode: code,
      shortName,
      fullName,
      board,
      industry,
      region,
      marketCapBand: formatMarketCapBand(toNumber(data.f116)),
      intro,
      mainBusiness,
      businessScope,
      businessReview,
      concepts,
      industryBlocks,
      mainProducts,
      sourceFacts,
      source: basicsResult.trace.status === "success" ? "eastmoney" : "local_index",
      sourceDetail,
    },
    traces: orderTraces(providerPlan, [
      basicsResult.trace,
      tencentQuoteResult.trace,
      companySurveyResult.trace,
      businessAnalysisResult.trace,
      relatedBlocksResult.trace,
      announcementsResult.trace,
      researchReportsResult.trace,
      incomeStatementResult.trace,
      balanceSheetResult.trace,
      cashFlowResult.trace,
    ]),
  };
}

type ProviderRunResult<T> = {
  value: T;
  trace: StockLookupProviderTrace;
};

function getProvider(providerPlan: StockProfileProvider[], providerId: StockProfileProviderId): StockProfileProvider {
  return (
    providerPlan.find((provider) => provider.id === providerId) ?? {
      id: providerId,
      label: getStockProfileProviderLabel(providerId),
      required: providerId === "eastmoney_push2",
      confidence: getStockProfileProviderConfidence(providerId),
      cacheTtlMs: getStockProfileProviderCacheTtlMs(providerId),
    }
  );
}

async function runProvider<T>(input: {
  provider: StockProfileProvider;
  enabled: boolean;
  fallback: T;
  timeoutMs: number;
  sourceUrl: string;
  expectedFields: string[];
  failOpen?: boolean;
  task: () => Promise<T>;
  toFacts: (value: T) => Record<string, unknown>;
}): Promise<ProviderRunResult<T>> {
  const startedAt = Date.now();

  if (!input.enabled) {
    return {
      value: input.fallback,
      trace: {
        provider: input.provider.id,
        providerLabel: input.provider.label,
        required: input.provider.required,
        status: "skipped",
        facts: {},
        expectedFields: input.expectedFields,
        sourceUrl: input.sourceUrl,
        confidence: input.provider.confidence,
        cacheTtlMs: input.provider.cacheTtlMs,
        fetchedAt: new Date().toISOString(),
        error: "",
        durationMs: 0,
        circuitState: stockProviderCircuitBreaker.snapshot(input.provider.id).state,
      },
    };
  }

  const circuit = stockProviderCircuitBreaker.begin(input.provider.id);
  if (!circuit.allowed) {
    const seconds = Math.max(1, Math.ceil(circuit.retryAfterMs / 1_000));
    const error = `${input.provider.label}已熔断，约 ${seconds} 秒后自动探测`;
    if (input.provider.required && !input.failOpen) throw new Error(error);
    return {
      value: input.fallback,
      trace: {
        provider: input.provider.id,
        providerLabel: input.provider.label,
        required: input.provider.required,
        status: "failed",
        facts: {},
        expectedFields: input.expectedFields,
        sourceUrl: input.sourceUrl,
        confidence: input.provider.confidence,
        cacheTtlMs: input.provider.cacheTtlMs,
        fetchedAt: new Date().toISOString(),
        error,
        durationMs: 0,
        circuitState: circuit.state,
      },
    };
  }

  try {
    const value = await withTimeout(input.task(), input.timeoutMs, `${input.provider.label}请求超时`);
    stockProviderCircuitBreaker.succeed(input.provider.id);
    return {
      value,
      trace: {
        provider: input.provider.id,
        providerLabel: input.provider.label,
        required: input.provider.required,
        status: "success",
        facts: input.toFacts(value),
        expectedFields: input.expectedFields,
        sourceUrl: input.sourceUrl,
        confidence: input.provider.confidence,
        cacheTtlMs: input.provider.cacheTtlMs,
        fetchedAt: new Date().toISOString(),
        error: "",
        durationMs: Date.now() - startedAt,
        circuitState: "closed",
      },
    };
  } catch (error) {
    const circuitAfterFailure = stockProviderCircuitBreaker.fail(input.provider.id);
    if (input.provider.required && !input.failOpen) throw error;
    return {
      value: input.fallback,
      trace: {
        provider: input.provider.id,
        providerLabel: input.provider.label,
        required: input.provider.required,
        status: "failed",
        facts: {},
        expectedFields: input.expectedFields,
        sourceUrl: input.sourceUrl,
        confidence: input.provider.confidence,
        cacheTtlMs: input.provider.cacheTtlMs,
        fetchedAt: new Date().toISOString(),
        error: getErrorMessage(error),
        durationMs: Date.now() - startedAt,
        circuitState: circuitAfterFailure.state,
      },
    };
  }
}

function buildProviderSourceUrl(provider: StockProfileProviderId, stockCode: string) {
  if (provider === "eastmoney_push2") {
    const prefix = stockCode.startsWith("6") ? "sh" : isBeijingStock(stockCode) ? "bj" : "sz";
    return `https://quote.eastmoney.com/${prefix}${stockCode}.html`;
  }
  if (provider === "baidu_related_blocks") {
    return `https://gushitong.baidu.com/stock/ab-${stockCode}`;
  }
  if (provider === "tencent_quote") {
    const prefix = stockCode.startsWith("6") ? "sh" : isBeijingStock(stockCode) ? "bj" : "sz";
    return `https://gu.qq.com/${prefix}${stockCode}/gp`;
  }
  if (provider === "cninfo_announcements") {
    return `https://www.cninfo.com.cn/new/disclosure/stock?stockCode=${stockCode}`;
  }
  if (provider === "eastmoney_reports") {
    return `https://data.eastmoney.com/report/stock.jshtml?encodeUrl=${stockCode}`;
  }
  if (provider.startsWith("sina_")) {
    const prefix = stockCode.startsWith("6") ? "sh" : isBeijingStock(stockCode) ? "bj" : "sz";
    return `https://finance.sina.com.cn/realstock/company/${prefix}${stockCode}/nc.shtml`;
  }
  return `https://emweb.securities.eastmoney.com/PC_HSF10/pages/index.html?type=web&code=${eastmoneyF10Code(stockCode)}`;
}

function orderTraces(providerPlan: StockProfileProvider[], traces: StockLookupProviderTrace[]) {
  const providerRank = new Map(providerPlan.map((provider, index) => [provider.id, index]));
  const originalRank = new Map(traces.map((trace, index) => [trace.provider, index]));
  return [...traces].sort((left, right) => {
    const leftRank = providerRank.get(left.provider) ?? providerPlan.length + (originalRank.get(left.provider) ?? 0);
    const rightRank = providerRank.get(right.provider) ?? providerPlan.length + (originalRank.get(right.provider) ?? 0);
    return leftRank - rightRank;
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function fetchEastmoneyStockBasics(stockCode: string, fetcher: StockLookupFetcher): Promise<EastmoneyStockData> {
  const url = new URL(EASTMONEY_STOCK_URL);
  url.searchParams.set("fltt", "2");
  url.searchParams.set("invt", "2");
  url.searchParams.set("fields", EASTMONEY_FIELDS);
  url.searchParams.set("secid", eastmoneySecId(stockCode));

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
  if (!data || !normalizeText(data.f57) || !normalizeText(data.f58)) {
    throw new Error("未查询到股票基础资料");
  }
  return data;
}

async function fetchEastmoneyCompanySurvey(stockCode: string, fetcher: StockLookupFetcher): Promise<EastmoneyCompanySurveyResponse> {
  const url = new URL(EASTMONEY_COMPANY_SURVEY_URL);
  url.searchParams.set("code", eastmoneyF10Code(stockCode));

  const response = await fetcher(url, {
    headers: eastmoneyF10Headers(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`公司概况查询失败：${response.status}`);
  }
  return (await response.json()) as EastmoneyCompanySurveyResponse;
}

async function fetchEastmoneyBusinessAnalysis(
  stockCode: string,
  fetcher: StockLookupFetcher,
): Promise<EastmoneyBusinessAnalysisResponse> {
  const url = new URL(EASTMONEY_BUSINESS_ANALYSIS_URL);
  url.searchParams.set("code", eastmoneyF10Code(stockCode));

  const response = await fetcher(url, {
    headers: eastmoneyF10Headers(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`经营分析查询失败：${response.status}`);
  }
  return (await response.json()) as EastmoneyBusinessAnalysisResponse;
}

async function fetchBaiduRelatedBlocks(stockCode: string, fetcher: StockLookupFetcher): Promise<RelatedBlocks> {
  const url = new URL(BAIDU_RELATED_BLOCK_URL);
  url.searchParams.set("code", stockCode);
  url.searchParams.set("market", "ab");
  url.searchParams.set("typeCode", "all");
  url.searchParams.set("finClientType", "pc");

  const response = await fetcher(url, {
    headers: {
      Host: "finance.pae.baidu.com",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/117.0.0.0 Safari/537.36",
      Accept: "application/vnd.finance-web.v1+json",
      Origin: "https://gushitong.baidu.com",
      Referer: "https://gushitong.baidu.com/",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`关联板块查询失败：${response.status}`);
  }
  return parseBaiduRelatedBlocks((await response.json()) as BaiduRelatedBlockResponse);
}

function parseBaiduRelatedBlocks(payload: BaiduRelatedBlockResponse): RelatedBlocks {
  const blocks = emptyRelatedBlocks();
  if (String(payload.ResultCode ?? "-1") !== "0") return blocks;

  for (const block of payload.Result ?? []) {
    const blockType = normalizeText(block.type);
    for (const item of block.list ?? []) {
      const entry = {
        name: normalizeText(item.name),
        desc: normalizeText(item.desc),
      };
      if (!entry.name) continue;
      if (blockType.includes("行业")) {
        blocks.industry.push(entry);
      } else if (blockType.includes("概念")) {
        blocks.concept.push(entry);
      } else if (blockType.includes("地域")) {
        blocks.region.push(entry);
      }
    }
  }

  return blocks;
}

function emptyRelatedBlocks(): RelatedBlocks {
  return { industry: [], concept: [], region: [] };
}

function relatedBlocksHasAny(blocks: RelatedBlocks) {
  return blocks.industry.length > 0 || blocks.concept.length > 0 || blocks.region.length > 0;
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
  return (item[6] === "CN" || item[6] === "BSE")
    && item[7] === "stock"
    && item[8] === true
    && A_SHARE_CODE_PATTERN.test(item[1]);
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

function buildIntro(
  shortName: string,
  industry: string,
  board: string,
  concepts: string[],
  region: string,
  companyIntro: string,
  baseSourceLabel = "东财基础资料",
) {
  if (companyIntro) return companyIntro;

  const fragments = [`${baseSourceLabel}显示，${shortName}`];
  if (industry) fragments.push(`属于${industry}行业`);
  if (board) fragments.push(`上市板块为${board}`);
  const eastmoneyIntro = fragments.length === 1 ? `${fragments[0]}。` : `${fragments[0]}${fragments.slice(1).join("，")}。`;
  const relatedFragments = [];
  if (concepts.length > 0) relatedFragments.push(`关联概念包含${concepts.slice(0, 6).join("、")}`);
  if (region) relatedFragments.push(`地域板块为${region}`);
  if (relatedFragments.length === 0) return eastmoneyIntro;
  return `${eastmoneyIntro}百度关联板块显示，${relatedFragments.join("，")}。`;
}

function buildMainBusiness(
  industry: string,
  industryBlocks: string[],
  concepts: string[],
  region: string,
  businessScope: string,
  businessReview: string,
  mainProducts: string[],
) {
  const fragments = [
    businessReview ? `经营评述：${businessReview}` : "",
    mainProducts.length > 0 ? `主营构成：${mainProducts.slice(0, 8).join("、")}` : "",
    businessScope ? `经营范围：${businessScope}` : "",
    industry ? `东财行业：${industry}` : "",
    industryBlocks.length > 0 ? `行业板块：${industryBlocks.slice(0, 4).join("、")}` : "",
    concepts.length > 0 ? `相关概念：${concepts.slice(0, 8).join("、")}` : "",
    region ? `地域板块：${region}` : "",
  ].filter(Boolean);
  return fragments.join("；") || industry;
}

function buildProfileSourceFacts(input: {
  code: string;
  shortName: string;
  fullName: string;
  industry: string;
  board: string;
  marketCapBand: string;
  concepts: string[];
  industryBlocks: string[];
  region: string;
  businessScope: string;
  businessReview: string;
  mainProducts: string[];
  sourceDetail: string;
}) {
  return [
    `代码：${input.code}`,
    `简称：${input.shortName}`,
    input.fullName ? `公司全称：${input.fullName}` : "",
    input.industry ? `东财行业：${input.industry}` : "",
    input.board ? `上市板块：${input.board}` : "",
    input.marketCapBand ? `市值区间：${input.marketCapBand}` : "",
    input.region ? `地区：${input.region}` : "",
    input.mainProducts.length > 0 ? `东财F10主营构成：${input.mainProducts.slice(0, 8).join("、")}` : "",
    input.businessReview ? `东财F10经营评述：${input.businessReview}` : "",
    input.businessScope ? `东财F10经营范围：${input.businessScope}` : "",
    input.industryBlocks.length > 0 ? `百度行业板块：${input.industryBlocks.slice(0, 6).join("、")}` : "",
    input.concepts.length > 0 ? `百度概念板块：${input.concepts.slice(0, 10).join("、")}` : "",
    input.sourceDetail ? `数据源：${input.sourceDetail}` : "",
  ].filter(Boolean);
}

function uniqueNames(entries: RelatedBlockEntry[]) {
  return Array.from(new Set(entries.map((entry) => entry.name).filter(Boolean)));
}

function eastmoneyF10Code(stockCode: string) {
  if (stockCode.startsWith("6")) return `SH${stockCode}`;
  if (isBeijingStock(stockCode)) return `BJ${stockCode}`;
  return `SZ${stockCode}`;
}

function isBeijingStock(stockCode: string) {
  return stockCode.startsWith("4")
    || stockCode.startsWith("8")
    || stockCode.startsWith("92");
}

function eastmoneyF10Headers() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Referer: "https://emweb.securities.eastmoney.com/",
  };
}

function compactText(value: unknown, maxLength: number) {
  const normalized = normalizeText(value).replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function getLatestBusinessReview(payload: EastmoneyBusinessAnalysisResponse) {
  const rows = (payload.jyps ?? []).filter((row) => normalizeText(row.BUSINESS_REVIEW));
  rows.sort((a, b) => normalizeText(b.REPORT_DATE).localeCompare(normalizeText(a.REPORT_DATE)));
  return rows[0]?.BUSINESS_REVIEW ?? "";
}

function getLatestMainProducts(payload: EastmoneyBusinessAnalysisResponse) {
  const rows = (payload.zygcfx ?? []).filter((row) => normalizeText(row.ITEM_NAME) && normalizeText(row.MAINOP_TYPE) === "2");
  rows.sort((a, b) => {
    const dateDiff = normalizeText(b.REPORT_DATE).localeCompare(normalizeText(a.REPORT_DATE));
    if (dateDiff !== 0) return dateDiff;
    return toNumber(a.RANK) - toNumber(b.RANK);
  });
  const latestDate = normalizeText(rows[0]?.REPORT_DATE);
  return Array.from(
    new Set(
      rows
        .filter((row) => normalizeText(row.REPORT_DATE) === latestDate)
        .map((row) => normalizeText(row.ITEM_NAME))
        .filter((item) => item && !item.includes("其他") && !item.includes("补充")),
    ),
  );
}

function getLatestBusinessComposition(payload: EastmoneyBusinessAnalysisResponse) {
  const allRows = (payload.zygcfx ?? []).filter((row) => normalizeText(row.ITEM_NAME));
  const productRows = allRows.filter((row) => normalizeText(row.MAINOP_TYPE) === "2");
  const rows = productRows.length > 0 ? productRows : allRows.filter((row) => normalizeText(row.MAINOP_TYPE) === "1");
  rows.sort((a, b) => {
    const dateDiff = normalizeText(b.REPORT_DATE).localeCompare(normalizeText(a.REPORT_DATE));
    if (dateDiff !== 0) return dateDiff;
    return toNumber(a.RANK) - toNumber(b.RANK);
  });
  const latestDate = normalizeText(rows[0]?.REPORT_DATE);
  return rows
    .filter((row) => normalizeText(row.REPORT_DATE) === latestDate)
    .filter((row) => !normalizeText(row.ITEM_NAME).includes("合计"))
    .slice(0, 8)
    .map((row) => ({
      name: normalizeText(row.ITEM_NAME),
      reportDate: latestDate,
      revenue: nullableNumber(row.MAIN_BUSINESS_INCOME),
      revenueRatio: ratioPercent(row.MBI_RATIO),
      cost: nullableNumber(row.MAIN_BUSINESS_COST),
      grossProfit: nullableNumber(row.MAIN_BUSINESS_RPOFIT),
      grossMargin: ratioPercent(row.GROSS_RPOFIT_RATIO),
    }));
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ratioPercent(value: unknown) {
  const ratio = nullableNumber(value);
  return ratio === null ? null : Math.round(ratio * 10_000) / 100;
}
