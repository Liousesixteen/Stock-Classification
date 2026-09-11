import { describe, expect, it } from "vitest";
import { getStockProfileProviderPlan, STOCK_PROFILE_PROVIDER_IDS } from "@/lib/datasources/providerPlan";
import {
  eastmoneySecId,
  inferBoard,
  lookupFastStockProfile,
  lookupStockProfile,
  lookupStockProfileWithTrace,
  resolveStockMention,
  resolveStockQuery,
} from "@/lib/datasources/stockLookup";

describe("stockLookup", () => {
  it("infers common A-share boards from the stock code prefix", () => {
    expect(inferBoard("300346")).toBe("创业板");
    expect(inferBoard("688019")).toBe("科创板");
    expect(inferBoard("600519")).toBe("沪市主板");
    expect(inferBoard("002371")).toBe("深市主板");
    expect(inferBoard("835185")).toBe("北交所");
    expect(inferBoard("920185")).toBe("北交所");
  });

  it("builds Eastmoney secids for Shanghai and Shenzhen style codes", () => {
    expect(eastmoneySecId("600519")).toBe("1.600519");
    expect(eastmoneySecId("688019")).toBe("1.688019");
    expect(eastmoneySecId("300346")).toBe("0.300346");
  });

  it("builds an instant local-index profile without calling network providers", () => {
    const profile = lookupFastStockProfile("江丰电子", {
      stockIndexItems: [["300666.SZ", "300666", "江丰电子", "jiangfengdianzi", "jfdz", [], "CN", "stock", true, 100]],
    });

    expect(profile).toMatchObject({
      stockCode: "300666",
      shortName: "江丰电子",
      board: "创业板",
      source: "local_index",
      sourceDetail: "本地股票索引",
    });
  });

  it("finds one company mentioned inside a research question", () => {
    const stockIndexItems = [
      ["600584.SH", "600584", "长电科技", "changdiankej", "cdkj", [], "CN", "stock", true, 100],
      ["603823.SH", "603823", "百合花", "baihehua", "bhh", [], "CN", "stock", true, 80],
    ];
    expect(resolveStockMention("长电科技的核心风险是什么？", { stockIndexItems })).toMatchObject({
      displayCode: "600584",
      nameZh: "长电科技",
    });
    expect(resolveStockMention("比较长电科技与百合花", { stockIndexItems })).toBeUndefined();
  });

  it("maps Eastmoney basics and Baidu related blocks into a richer company profile", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname.includes("eastmoney")) {
        if (url.hostname === "push2.eastmoney.com") {
          expect(url.searchParams.get("secid")).toBe("0.300346");
          expect(url.searchParams.get("fields")).toContain("f57");
          return new Response(
            JSON.stringify({
              data: {
                f57: "300346",
                f58: "南大光电",
                f116: 18_600_000_000,
                f117: 16_200_000_000,
                f127: "电子化学品",
                f189: "20120807",
              },
            }),
          );
        }

        expect(url.searchParams.get("code")).toBe("SZ300346");
        if (url.pathname.includes("CompanySurvey")) {
          return new Response(
            JSON.stringify({
              jbzl: {
                gsmc: "江苏南大光电材料股份有限公司",
                qy: "江苏",
                sshy: "电子化学品",
                gsjj: "南大光电围绕先进前驱体材料、电子特气和光刻胶材料开展电子材料业务。",
                jyfw: "电子专用材料研发、制造和销售。",
              },
            }),
          );
        }

        return new Response(
          JSON.stringify({
            zyfw: [{ BUSINESS_SCOPE: "电子专用材料研发、制造和销售。" }],
            zygcfx: [
              { REPORT_DATE: "2025-12-31", MAINOP_TYPE: "2", ITEM_NAME: "电子特气", RANK: 1 },
              { REPORT_DATE: "2025-12-31", MAINOP_TYPE: "2", ITEM_NAME: "光刻胶材料", RANK: 2 },
            ],
            jyps: [
              {
                REPORT_DATE: "2025-12-31",
                BUSINESS_REVIEW: "公司电子材料业务覆盖先进前驱体材料、电子特气和光刻胶材料。",
              },
            ],
          }),
        );
      }

      expect(url.hostname).toBe("finance.pae.baidu.com");
      expect(url.searchParams.get("code")).toBe("300346");
      return new Response(
        JSON.stringify({
          ResultCode: 0,
          Result: [
            { type: "所属行业", list: [{ name: "电子化学品", desc: "申万行业" }] },
            {
              type: "概念板块",
              list: [
                { name: "光刻胶", desc: "光刻材料方向" },
                { name: "半导体材料", desc: "半导体上游材料" },
              ],
            },
            { type: "地域板块", list: [{ name: "江苏板块", desc: "注册地相关" }] },
          ],
        }),
      );
    };

    await expect(lookupStockProfile("300346", fetcher, {
      providerOrder: [...STOCK_PROFILE_PROVIDER_IDS],
    })).resolves.toMatchObject({
      stockCode: "300346",
      shortName: "南大光电",
      fullName: "江苏南大光电材料股份有限公司",
      board: "创业板",
      industry: "电子化学品",
      region: "江苏板块",
      marketCapBand: "100-300亿",
      intro: "南大光电围绕先进前驱体材料、电子特气和光刻胶材料开展电子材料业务。",
      mainBusiness: "经营评述：公司电子材料业务覆盖先进前驱体材料、电子特气和光刻胶材料。；主营构成：电子特气、光刻胶材料；经营范围：电子专用材料研发、制造和销售。；东财行业：电子化学品；行业板块：电子化学品；相关概念：光刻胶、半导体材料；地域板块：江苏板块",
      businessScope: "电子专用材料研发、制造和销售。",
      businessReview: "公司电子材料业务覆盖先进前驱体材料、电子特气和光刻胶材料。",
      concepts: ["光刻胶", "半导体材料"],
      mainProducts: ["电子特气", "光刻胶材料"],
      sourceFacts: expect.arrayContaining(["百度概念板块：光刻胶、半导体材料"]),
      sourceDetail: "东方财富 push2 基础资料；东方财富 F10 公司概况；东方财富 F10 经营分析；百度股市通关联板块",
      source: "eastmoney",
    });
  });

  it("supports provider priority config and can disable optional profile enrichers", async () => {
    const requestedUrls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requestedUrls.push(url.hostname + url.pathname);
      expect(url.hostname).toBe("push2.eastmoney.com");
      return new Response(
        JSON.stringify({
          data: {
            f57: "300346",
            f58: "南大光电",
            f116: 18_600_000_000,
            f127: "电子化学品",
          },
        }),
      );
    };

    const result = await lookupStockProfileWithTrace("300346", fetcher, {
      providerOrder: ["eastmoney_push2"],
    });

    expect(requestedUrls).toEqual(["push2.eastmoney.com/api/qt/stock/get"]);
    expect(result.profile).toMatchObject({
      fullName: "",
      businessReview: "",
      concepts: [],
      sourceDetail: "东方财富 push2 基础资料",
    });
    expect(result.traces).toEqual([
      expect.objectContaining({ provider: "eastmoney_push2", status: "success" }),
      expect.objectContaining({ provider: "tencent_quote", status: "skipped" }),
      expect.objectContaining({ provider: "eastmoney_f10_company_survey", status: "skipped" }),
      expect.objectContaining({ provider: "eastmoney_f10_business_analysis", status: "skipped" }),
      expect.objectContaining({ provider: "baidu_related_blocks", status: "skipped" }),
      expect.objectContaining({ provider: "cninfo_announcements", status: "skipped" }),
      expect.objectContaining({ provider: "eastmoney_reports", status: "skipped" }),
      expect.objectContaining({ provider: "sina_income_statement", status: "skipped" }),
      expect.objectContaining({ provider: "sina_balance_sheet", status: "skipped" }),
      expect.objectContaining({ provider: "sina_cash_flow", status: "skipped" }),
    ]);
  });

  it("keeps basic facts when optional providers fail and exposes their status", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname === "push2.eastmoney.com") {
        return new Response(
          JSON.stringify({
            data: {
              f57: "300346",
              f58: "南大光电",
              f116: 18_600_000_000,
              f127: "电子化学品",
            },
          }),
        );
      }

      return new Response("temporary failure", { status: 503 });
    };

    const result = await lookupStockProfileWithTrace("300346", fetcher, {
      providerTimeoutMs: 500,
      providerOrder: [...STOCK_PROFILE_PROVIDER_IDS],
    });

    expect(result.profile).toMatchObject({
      stockCode: "300346",
      shortName: "南大光电",
      industry: "电子化学品",
      sourceDetail: "东方财富 push2 基础资料",
    });
    expect(result.traces.map(({ provider, status }) => [provider, status])).toEqual([
      ["eastmoney_push2", "success"],
      ["tencent_quote", "failed"],
      ["eastmoney_f10_company_survey", "failed"],
      ["eastmoney_f10_business_analysis", "failed"],
      ["baidu_related_blocks", "failed"],
      ["cninfo_announcements", "failed"],
      ["eastmoney_reports", "failed"],
      ["sina_income_statement", "failed"],
      ["sina_balance_sheet", "failed"],
      ["sina_cash_flow", "failed"],
    ]);
    expect(result.traces.slice(1).every((trace) => trace.error?.includes("503"))).toBe(true);
  });

  it("falls back to the local stock index when the required network basics source fails", async () => {
    const result = await lookupStockProfileWithTrace(
      "南大光电",
      async () => new Response("temporary failure", { status: 503 }),
      {
        providerOrder: ["eastmoney_push2"],
        stockIndexItems: [
          ["300346.SZ", "300346", "南大光电", "nandaguangdian", "ndgd", [], "CN", "stock", true, 100],
        ],
      },
    );

    expect(result.profile).toMatchObject({
      stockCode: "300346",
      shortName: "南大光电",
      source: "local_index",
      sourceDetail: "本地股票索引",
    });
    expect(result.traces[0]).toMatchObject({
      provider: "eastmoney_push2",
      required: true,
      status: "failed",
    });
  });

  it("normalizes provider priority using the configured data-source plan", () => {
    expect(getStockProfileProviderPlan({
      providerOrder: ["baidu_related_blocks", "eastmoney_f10_company_survey", "baidu_related_blocks"],
    }).map((provider) => provider.id)).toEqual(["baidu_related_blocks", "eastmoney_f10_company_survey"]);
    expect(() => getStockProfileProviderPlan({
      providerOrder: ["baidu_related_blocks", "unknown"],
    })).toThrow("未知股票数据 Provider");
  });

  it("resolves an exact Chinese stock name from a local stock index before lookup", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("secid")).toBe("1.688235");
      return new Response(
        JSON.stringify({
          data: {
            f57: "688235",
            f58: "百济神州",
            f116: 427_000_000_000,
            f127: "化学制药",
          },
        }),
      );
    };

    await expect(
      lookupStockProfile("百济神州", fetcher, {
        providerOrder: ["eastmoney_push2"],
        stockIndexItems: [["688235.SH", "688235", "百济神州", "baijishenzhou", "bjsz", [], "CN", "stock", true, 100]],
      }),
    ).resolves.toMatchObject({
      stockCode: "688235",
      shortName: "百济神州",
      board: "科创板",
      industry: "化学制药",
    });
  });

  it("searches local stock index by code name and pinyin abbreviation", () => {
    const stockIndexItems = [
      ["688235.SH", "688235", "百济神州", "baijishenzhou", "bjsz", [], "CN", "stock", true, 100],
      ["06160.HK", "06160", "百济神州", "baijishenzhou", "bjsz", [], "HK", "stock", true, 100],
      ["300059.SZ", "300059", "东方财富", "dongfangcaifu", "dfcf", [], "CN", "stock", true, 100],
    ];

    expect(resolveStockQuery("百济神州", { stockIndexItems })?.displayCode).toBe("688235");
    expect(resolveStockQuery("dfcf", { stockIndexItems })?.displayCode).toBe("300059");
    expect(resolveStockQuery("06160", { stockIndexItems })).toBeUndefined();
  });

  it("resolves the current 92-prefix Beijing Stock Exchange codes from BSE index rows", () => {
    const stockIndexItems = [
      ["920185.BJ", "920185", "贝特瑞", "beiterui", "btr", [], "BSE", "stock", true, 100],
    ];

    expect(resolveStockQuery("920185", { stockIndexItems })).toMatchObject({
      displayCode: "920185",
      nameZh: "贝特瑞",
    });
    expect(resolveStockQuery("btr", { stockIndexItems })?.displayCode).toBe("920185");
  });

  it("uses the local index when the upstream response does not contain stock data", async () => {
    const fetcher = async () => new Response(JSON.stringify({ data: null }));

    await expect(lookupStockProfile("300346", fetcher)).resolves.toMatchObject({
      stockCode: "300346",
      source: "local_index",
      sourceDetail: "本地股票索引",
    });
  });
});
