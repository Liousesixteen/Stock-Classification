import { describe, expect, it } from "vitest";
import {
  balanceSheetFacts,
  cashFlowFacts,
  fetchSinaFinancialStatement,
  incomeStatementFacts,
} from "@/lib/datasources/sinaFinancialStatements";

function responseFor(source: string) {
  const rows = source === "lrb"
    ? [
        { item_field: "BIZINCO", item_value: "661579878.18", item_tongbi: 0.05454 },
        { item_field: "PARENETP", item_value: "124201774.05", item_tongbi: 0.29971 },
        { item_field: "BASICEPS", item_value: "0.18", item_tongbi: 0.28571 },
      ]
    : source === "fzb"
      ? [
          { item_field: "TOTASSET", item_value: "6126658563.13", item_tongbi: -0.05216 },
          { item_field: "TOTLIAB", item_value: "2075083676.70", item_tongbi: -0.18767 },
          { item_field: "PARESHARRIGH", item_value: "3600114986.44", item_tongbi: 0.05352 },
        ]
      : [{ item_field: "MANANETR", item_value: "100220816.06", item_tongbi: -0.39243 }];
  return {
    result: {
      status: { code: 0 },
      data: {
        report_date: [{ date_value: "20260331", date_description: "2026一季报" }],
        report_list: {
          "20260331": {
            rCurrency: "CNY",
            is_audit: "未审计",
            publish_date: "20260424",
            data: rows,
          },
        },
      },
    },
  };
}

describe("sina financial statement provider", () => {
  it("normalizes income, balance sheet and cash-flow metrics", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return new Response(JSON.stringify(responseFor(url.searchParams.get("source") ?? "")));
    };

    const [income, balance, cashFlow] = await Promise.all([
      fetchSinaFinancialStatement("300346", "lrb", fetcher),
      fetchSinaFinancialStatement("300346", "fzb", fetcher),
      fetchSinaFinancialStatement("300346", "llb", fetcher),
    ]);

    expect(incomeStatementFacts(income)).toMatchObject({
      financialReportDate: "20260331",
      revenue: 661579878.18,
      netProfit: 124201774.05,
      basicEps: 0.18,
    });
    expect(balanceSheetFacts(balance)).toMatchObject({
      totalAssets: 6126658563.13,
      totalLiabilities: 2075083676.7,
      parentEquity: 3600114986.44,
    });
    expect(balanceSheetFacts(balance).debtRatio).toBeCloseTo(0.3387, 3);
    expect(cashFlowFacts(cashFlow)).toMatchObject({
      operatingCashFlow: 100220816.06,
      operatingCashFlowYoY: -0.39243,
    });
  });
});
