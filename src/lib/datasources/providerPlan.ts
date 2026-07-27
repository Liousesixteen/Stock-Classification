export const STOCK_PROFILE_PROVIDER_IDS = [
  "eastmoney_push2",
  "tencent_quote",
  "eastmoney_f10_company_survey",
  "eastmoney_f10_business_analysis",
  "baidu_related_blocks",
  "cninfo_announcements",
  "eastmoney_reports",
  "sina_income_statement",
  "sina_balance_sheet",
  "sina_cash_flow",
] as const;

export type StockProfileProviderId = (typeof STOCK_PROFILE_PROVIDER_IDS)[number];

export type StockProfileProvider = {
  id: StockProfileProviderId;
  label: string;
  required: boolean;
  confidence: "high" | "medium" | "low";
  cacheTtlMs: number;
};

const PROVIDER_LABELS: Record<StockProfileProviderId, string> = {
  eastmoney_push2: "东方财富 push2 基础资料",
  tencent_quote: "腾讯财经实时估值",
  eastmoney_f10_company_survey: "东方财富 F10 公司概况",
  eastmoney_f10_business_analysis: "东方财富 F10 经营分析",
  baidu_related_blocks: "百度股市通关联板块",
  cninfo_announcements: "巨潮资讯公司公告",
  eastmoney_reports: "东方财富机构研报",
  sina_income_statement: "新浪财经利润表",
  sina_balance_sheet: "新浪财经资产负债表",
  sina_cash_flow: "新浪财经现金流量表",
};

const PROVIDER_CONFIDENCE: Record<StockProfileProviderId, StockProfileProvider["confidence"]> = {
  eastmoney_push2: "high",
  tencent_quote: "high",
  eastmoney_f10_company_survey: "high",
  eastmoney_f10_business_analysis: "high",
  baidu_related_blocks: "medium",
  cninfo_announcements: "high",
  eastmoney_reports: "high",
  sina_income_statement: "high",
  sina_balance_sheet: "high",
  sina_cash_flow: "high",
};

const PROVIDER_CACHE_TTL_MS: Record<StockProfileProviderId, number> = {
  eastmoney_push2: 10 * 60 * 1000,
  tencent_quote: 10 * 60 * 1000,
  eastmoney_f10_company_survey: 24 * 60 * 60 * 1000,
  eastmoney_f10_business_analysis: 24 * 60 * 60 * 1000,
  baidu_related_blocks: 24 * 60 * 60 * 1000,
  cninfo_announcements: 60 * 60 * 1000,
  eastmoney_reports: 6 * 60 * 60 * 1000,
  sina_income_statement: 6 * 60 * 60 * 1000,
  sina_balance_sheet: 6 * 60 * 60 * 1000,
  sina_cash_flow: 6 * 60 * 60 * 1000,
};

export function getStockProfileProviderPlan(input?: { providerOrder?: string[]; envValue?: string }): StockProfileProvider[] {
  const providerOrder = normalizeProviderOrder(input);

  return providerOrder.map((id) => ({
    id,
    label: PROVIDER_LABELS[id],
    required: id === "eastmoney_push2",
    confidence: PROVIDER_CONFIDENCE[id],
    cacheTtlMs: PROVIDER_CACHE_TTL_MS[id],
  }));
}

export function isStockProfileProviderEnabled(plan: StockProfileProvider[], id: StockProfileProviderId) {
  return plan.some((provider) => provider.id === id);
}

export function getStockProfileProviderLabel(id: StockProfileProviderId) {
  return PROVIDER_LABELS[id];
}

export function getStockProfileProviderConfidence(id: StockProfileProviderId) {
  return PROVIDER_CONFIDENCE[id];
}

export function getStockProfileProviderCacheTtlMs(id: StockProfileProviderId) {
  return PROVIDER_CACHE_TTL_MS[id];
}

function normalizeProviderOrder(input?: { providerOrder?: string[]; envValue?: string }) {
  const configuredOrder = input?.providerOrder ?? parseProviderOrder(input?.envValue ?? process.env.STOCK_PROFILE_SOURCE_PRIORITY);
  const invalid = configuredOrder.filter((provider) => !isStockProfileProviderId(provider));
  if (invalid.length > 0) {
    throw new Error(`未知股票数据 Provider：${invalid.join("、")}`);
  }
  const normalizedOrder: StockProfileProviderId[] = configuredOrder.filter(isStockProfileProviderId);
  return dedupe(normalizedOrder);
}

function parseProviderOrder(value?: string) {
  if (!value) return [];
  if (["disabled", "none", "off"].includes(value.trim().toLocaleLowerCase())) return [];
  return value
    .split(",")
    .map((provider) => provider.trim())
    .filter(Boolean);
}

function isStockProfileProviderId(value: string): value is StockProfileProviderId {
  return STOCK_PROFILE_PROVIDER_IDS.some((id) => id === value);
}

function dedupe<T>(values: T[]) {
  return Array.from(new Set(values));
}
