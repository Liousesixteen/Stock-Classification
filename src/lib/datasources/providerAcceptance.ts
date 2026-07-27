import acceptanceCompanies from "../../../data/provider-acceptance-companies.json";
import {
  lookupStockProfileWithTrace,
  type StockLookupWithTrace,
} from "./stockLookup";

export type ProviderAcceptanceCompany = {
  code: string;
  name: string;
  sector: string;
  board: string;
};

export type ProviderAcceptanceResult = ProviderAcceptanceCompany & {
  resolvedName: string;
  latencyMs: number;
  successfulProviders: number;
  failedProviders: string[];
  missingCoreFields: string[];
  passed: boolean;
  error: string;
};

export type ProviderAcceptanceReport = {
  generatedAt: string;
  total: number;
  passed: number;
  passRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  results: ProviderAcceptanceResult[];
};

type AcceptanceDependencies = {
  lookup?: typeof lookupStockProfileWithTrace;
  now?: () => number;
};

const ACCEPTANCE_PROVIDER_ORDER = [
  "eastmoney_push2",
  "tencent_quote",
  "eastmoney_f10_company_survey",
  "eastmoney_f10_business_analysis",
  "sina_income_statement",
  "sina_balance_sheet",
  "sina_cash_flow",
];

export function getProviderAcceptanceCompanies(): ProviderAcceptanceCompany[] {
  return acceptanceCompanies.map((company) => ({ ...company }));
}

export async function runProviderAcceptance(
  options: {
    companies?: ProviderAcceptanceCompany[];
    concurrency?: number;
    timeoutMs?: number;
  } = {},
  dependencies: AcceptanceDependencies = {},
): Promise<ProviderAcceptanceReport> {
  const companies = options.companies ?? getProviderAcceptanceCompanies();
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 8));
  const timeoutMs = Math.max(options.timeoutMs ?? 5_000, 500);
  const lookup = dependencies.lookup ?? lookupStockProfileWithTrace;
  const now = dependencies.now ?? Date.now;

  const results = await mapWithConcurrency(companies, concurrency, async (company) => {
    const startedAt = now();
    try {
      const lookupResult = await lookup(company.code, undefined, {
        providerOrder: ACCEPTANCE_PROVIDER_ORDER,
        providerTimeoutMs: timeoutMs,
      });
      return evaluateCompany(company, lookupResult, now() - startedAt);
    } catch (error) {
      return {
        ...company,
        resolvedName: "",
        latencyMs: now() - startedAt,
        successfulProviders: 0,
        failedProviders: ["eastmoney_push2"],
        missingCoreFields: ["stockCode", "shortName", "industry"],
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const latencies = results.map((result) => result.latencyMs).sort((left, right) => left - right);
  const passed = results.filter((result) => result.passed).length;
  return {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed,
    passRate: results.length > 0 ? passed / results.length : 0,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    results,
  };
}

function evaluateCompany(
  company: ProviderAcceptanceCompany,
  result: StockLookupWithTrace,
  latencyMs: number,
): ProviderAcceptanceResult {
  const missingCoreFields = [
    result.profile.stockCode ? "" : "stockCode",
    result.profile.shortName ? "" : "shortName",
    result.profile.industry ? "" : "industry",
    result.profile.mainBusiness ? "" : "mainBusiness",
  ].filter(Boolean);
  const successfulProviders = result.traces.filter((trace) => trace.status === "success").length;
  const failedProviders = result.traces
    .filter((trace) => trace.status === "failed")
    .map((trace) => trace.provider);
  const identityAvailable = Boolean(result.profile.stockCode && result.profile.shortName);
  return {
    ...company,
    resolvedName: result.profile.shortName,
    latencyMs,
    successfulProviders,
    failedProviders,
    missingCoreFields,
    passed: identityAvailable && successfulProviders >= 3 && missingCoreFields.length === 0,
    error: "",
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(values[index]);
      }
    }),
  );
  return results;
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1),
  );
  return sortedValues[index];
}
