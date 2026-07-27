import type { StockLookupFetcher } from "./stockLookup";

export type SinaStatementSource = "lrb" | "fzb" | "llb";

type SinaStatementItem = {
  item_field?: string;
  item_title?: string;
  item_value?: string | number | null;
  item_tongbi?: string | number | null;
};

type SinaStatementReport = {
  rType?: string;
  rCurrency?: string;
  data_source?: string;
  is_audit?: string;
  publish_date?: string;
  data?: SinaStatementItem[];
};

type SinaStatementResponse = {
  result?: {
    status?: {
      code?: number;
      msg?: string;
    };
    data?: {
      report_date?: Array<{
        date_value?: string;
        date_description?: string;
      }>;
      report_list?: Record<string, SinaStatementReport>;
    };
  };
};

export type NormalizedFinancialStatement = {
  reportDate: string;
  reportLabel: string;
  publishedAt: string;
  audited: boolean;
  currency: string;
  metrics: Record<string, number | null>;
  yearOverYear: Record<string, number | null>;
};

const SINA_FINANCE_URL =
  "https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022";

const STATEMENT_FIELDS: Record<SinaStatementSource, string[]> = {
  lrb: ["BIZINCO", "PARENETP", "BASICEPS"],
  fzb: ["TOTASSET", "TOTLIAB", "PARESHARRIGH"],
  llb: ["MANANETR"],
};

export async function fetchSinaFinancialStatement(
  stockCode: string,
  source: SinaStatementSource,
  fetcher: StockLookupFetcher,
) {
  const url = new URL(SINA_FINANCE_URL);
  url.searchParams.set("paperCode", `${marketPrefix(stockCode)}${stockCode}`);
  url.searchParams.set("source", source);
  url.searchParams.set("type", "0");
  url.searchParams.set("page", "1");
  url.searchParams.set("num", "8");

  const response = await fetcher(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Referer: "https://finance.sina.com.cn/",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`新浪财经财务报表查询失败：${response.status}`);

  const payload = (await response.json()) as SinaStatementResponse;
  if (payload.result?.status?.code && payload.result.status.code !== 0) {
    throw new Error(payload.result.status.msg || "新浪财经财务报表返回异常");
  }

  const reportDates = payload.result?.data?.report_date ?? [];
  const reportList = payload.result?.data?.report_list ?? {};
  return reportDates
    .map((date) => normalizeReport(date.date_value ?? "", date.date_description ?? "", reportList[date.date_value ?? ""], source))
    .filter((report): report is NormalizedFinancialStatement => Boolean(report))
    .slice(0, 8);
}

export function incomeStatementFacts(statements: NormalizedFinancialStatement[]) {
  const latest = statements[0];
  return {
    incomeStatements: statements,
    financialReportDate: latest?.reportDate ?? "",
    revenue: latest?.metrics.BIZINCO ?? null,
    revenueYoY: latest?.yearOverYear.BIZINCO ?? null,
    netProfit: latest?.metrics.PARENETP ?? null,
    netProfitYoY: latest?.yearOverYear.PARENETP ?? null,
    basicEps: latest?.metrics.BASICEPS ?? null,
  };
}

export function balanceSheetFacts(statements: NormalizedFinancialStatement[]) {
  const latest = statements[0];
  const totalAssets = latest?.metrics.TOTASSET ?? null;
  const totalLiabilities = latest?.metrics.TOTLIAB ?? null;
  return {
    balanceSheets: statements,
    financialReportDate: latest?.reportDate ?? "",
    totalAssets,
    totalLiabilities,
    parentEquity: latest?.metrics.PARESHARRIGH ?? null,
    debtRatio: totalAssets && totalLiabilities !== null ? totalLiabilities / totalAssets : null,
  };
}

export function cashFlowFacts(statements: NormalizedFinancialStatement[]) {
  const latest = statements[0];
  return {
    cashFlowStatements: statements,
    financialReportDate: latest?.reportDate ?? "",
    operatingCashFlow: latest?.metrics.MANANETR ?? null,
    operatingCashFlowYoY: latest?.yearOverYear.MANANETR ?? null,
  };
}

function normalizeReport(
  reportDate: string,
  reportLabel: string,
  report: SinaStatementReport | undefined,
  source: SinaStatementSource,
): NormalizedFinancialStatement | null {
  if (!reportDate || !report) return null;
  const itemMap = new Map((report.data ?? []).map((item) => [item.item_field ?? "", item]));
  const metrics: Record<string, number | null> = {};
  const yearOverYear: Record<string, number | null> = {};
  for (const field of STATEMENT_FIELDS[source]) {
    metrics[field] = toNumber(itemMap.get(field)?.item_value);
    yearOverYear[field] = toNumber(itemMap.get(field)?.item_tongbi);
  }
  return {
    reportDate,
    reportLabel,
    publishedAt: report.publish_date ?? "",
    audited: report.is_audit === "审计",
    currency: report.rCurrency ?? "CNY",
    metrics,
    yearOverYear,
  };
}

function marketPrefix(stockCode: string) {
  if (stockCode.startsWith("6")) return "sh";
  if (stockCode.startsWith("8") || stockCode.startsWith("4") || stockCode.startsWith("92")) return "bj";
  return "sz";
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
