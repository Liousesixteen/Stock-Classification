import { describe, expect, it, vi } from "vitest";
import {
  cninfoOrgId,
  fetchCninfoAnnouncements,
  fetchEastmoneyResearchReports,
  fetchTencentQuoteFacts,
} from "@/lib/datasources/marketIntelligenceProviders";

describe("market intelligence providers", () => {
  it("decodes Tencent quote fields with PB at index 46", async () => {
    const values = Array.from({ length: 88 }, () => "");
    values[1] = "Test Stock";
    values[2] = "300346";
    values[3] = "35.62";
    values[4] = "34.80";
    values[32] = "2.36";
    values[38] = "3.21";
    values[39] = "48.50";
    values[43] = "7.22";
    values[44] = "186.00";
    values[45] = "162.00";
    values[46] = "5.18";
    values[47] = "38.28";
    values[48] = "31.32";
    const fetcher = vi.fn(async () => new Response(`v_sz300346="51~${values.slice(1).join("~")}";`));

    await expect(fetchTencentQuoteFacts("300346", fetcher)).resolves.toMatchObject({
      price: 35.62,
      changePercent: 2.36,
      peTtm: 48.5,
      pb: 5.18,
      totalMarketCapYi: 186,
      circulatingMarketCapYi: 162,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://qt.gtimg.cn/q=sz300346",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("uses the current CNInfo orgId format and keeps announcement links", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect((init?.body as URLSearchParams).get("stock")).toBe("688017,gssh0688017");
      return new Response(
        JSON.stringify({
          announcements: [
            {
              announcementId: "1212345678",
              announcementTitle: "<em>2025 年年度报告</em>",
              announcementTypeName: "年度报告",
              announcementTime: "2026-03-28 18:00:00",
            },
          ],
        }),
      );
    });

    expect(cninfoOrgId("688017")).toBe("gssh0688017");
    expect(cninfoOrgId("300346")).toBe("gssz0300346");
    expect(cninfoOrgId("920185")).toBe("gsbj0920185");
    await expect(fetchCninfoAnnouncements("688017", fetcher)).resolves.toEqual([
      {
        title: "2025 年年度报告",
        type: "年度报告",
        date: "2026-03-28",
        url: "https://www.cninfo.com.cn/new/disclosure/detail?annoId=1212345678",
      },
    ]);
  });

  it("normalizes Eastmoney research reports and builds PDF source links", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("code")).toBe("688017");
      expect(url.searchParams.get("pageSize")).toBe("20");
      return new Response(
        JSON.stringify({
          data: [
            {
              title: "精密传动平台持续成长",
              publishDate: "2026-07-25 00:00:00",
              orgSName: "示例证券",
              infoCode: "AP202607250001",
              predictThisYearEps: "1.23",
              predictNextYearEps: "1.68",
              predictNextTwoYearEps: "2.10",
              emRatingName: "增持",
              indvInduName: "通用设备",
            },
          ],
        }),
      );
    });

    await expect(fetchEastmoneyResearchReports("688017", fetcher)).resolves.toEqual([
      {
        title: "精密传动平台持续成长",
        publishDate: "2026-07-25",
        organization: "示例证券",
        rating: "增持",
        industry: "通用设备",
        predictedEps: {
          currentYear: 1.23,
          nextYear: 1.68,
          nextTwoYears: 2.1,
        },
        pdfUrl: "https://pdf.dfcfw.com/pdf/H3_AP202607250001_1.pdf",
      },
    ]);
  });

  it("surfaces provider HTTP failures instead of fabricating empty facts", async () => {
    const fetcher = vi.fn(async () => new Response("unavailable", { status: 503 }));

    await expect(fetchTencentQuoteFacts("300346", fetcher)).rejects.toThrow("503");
    await expect(fetchCninfoAnnouncements("300346", fetcher)).rejects.toThrow("503");
    await expect(fetchEastmoneyResearchReports("300346", fetcher)).rejects.toThrow("503");
  });
});
