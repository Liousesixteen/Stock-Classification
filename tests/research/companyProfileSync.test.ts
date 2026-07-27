import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { organizeStockFacts } from "@/lib/agents/classificationAgent";
import type { StockLookupWithTrace } from "@/lib/datasources/stockLookup";
import { migrate } from "@/lib/db/schema";
import { runCompanyProfileSync } from "@/lib/research/companyProfileSync";
import { createCategory } from "@/lib/repositories/categories";
import { upsertCompany } from "@/lib/repositories/companies";
import { listCompanyFieldFacts } from "@/lib/repositories/companyFieldFacts";
import { upsertRelation } from "@/lib/repositories/relations";
import { listSourceSnapshots } from "@/lib/repositories/sourceSnapshots";
import { createSyncTask, getSyncTaskById } from "@/lib/repositories/syncTasks";

describe("company profile sync", () => {
  it("persists provider facts at field level, including missing and failed fields", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    upsertCompany(db, {
      stockCode: "300346",
      shortName: "南大光电",
      fullName: "",
      board: "创业板",
      industry: "",
      region: "",
      marketCapBand: "",
      intro: "",
      mainBusiness: "",
      updatedAt: "",
    });
    const categoryId = createCategory(db, { name: "光刻胶", industry: "半导体材料" });
    upsertRelation(db, {
      stockCode: "300346",
      categoryId,
      relationType: "待验证",
      confidence: "低",
      rationale: "等待后台补全",
      isWatchlist: false,
    });
    const taskId = createSyncTask(db, {
      stockCode: "300346",
      taskType: "company_research_profile",
      source: "test",
      status: "pending",
      message: "等待同步",
    });

    const lookupResult: StockLookupWithTrace = {
      profile: {
        stockCode: "300346",
        shortName: "南大光电",
        fullName: "江苏南大光电材料股份有限公司",
        board: "创业板",
        industry: "电子化学品",
        region: "",
        marketCapBand: "100-300亿",
        intro: "电子材料公司。",
        mainBusiness: "光刻胶材料与电子特气。",
        businessScope: "",
        businessReview: "",
        concepts: ["光刻胶"],
        industryBlocks: ["电子化学品"],
        mainProducts: ["光刻胶材料"],
        sourceFacts: ["行业：电子化学品"],
        source: "eastmoney",
        sourceDetail: "东方财富；百度股市通",
      },
      traces: [
        {
          provider: "eastmoney_push2",
          providerLabel: "东方财富 push2 基础资料",
          required: true,
          status: "success",
          facts: { shortName: "南大光电", industry: "电子化学品", listingDate: "" },
          expectedFields: ["shortName", "industry", "listingDate"],
          sourceUrl: "https://quote.eastmoney.com/sz300346.html",
          confidence: "high",
          cacheTtlMs: 600_000,
          fetchedAt: "2026-07-26T02:00:00.000Z",
          error: "",
          durationMs: 120,
        },
        {
          provider: "eastmoney_f10_business_analysis",
          providerLabel: "东方财富 F10 经营分析",
          required: false,
          status: "failed",
          facts: {},
          expectedFields: ["businessReview", "mainProducts"],
          sourceUrl: "https://emweb.securities.eastmoney.com/",
          confidence: "high",
          cacheTtlMs: 86_400_000,
          fetchedAt: "2026-07-26T02:00:00.000Z",
          error: "上游超时",
          durationMs: 3_500,
        },
        {
          provider: "tencent_quote",
          providerLabel: "腾讯财经实时估值",
          required: false,
          status: "success",
          facts: { price: 35.62, peTtm: 48.5, pb: 5.18 },
          expectedFields: ["price", "peTtm", "pb"],
          sourceUrl: "https://gu.qq.com/sz300346/gp",
          confidence: "high",
          cacheTtlMs: 600_000,
          fetchedAt: "2026-07-26T02:00:00.000Z",
          error: "",
          durationMs: 90,
        },
        {
          provider: "cninfo_announcements",
          providerLabel: "巨潮资讯公司公告",
          required: false,
          status: "success",
          facts: {
            announcements: [
              {
                title: "2025 年年度报告",
                type: "年度报告",
                date: "2026-03-28",
                url: "https://www.cninfo.com.cn/new/disclosure/detail?annoId=1212345678",
              },
            ],
          },
          expectedFields: ["announcements"],
          sourceUrl: "https://www.cninfo.com.cn/new/disclosure/stock?stockCode=300346",
          confidence: "high",
          cacheTtlMs: 3_600_000,
          fetchedAt: "2026-07-26T02:00:00.000Z",
          error: "",
          durationMs: 180,
        },
        {
          provider: "eastmoney_reports",
          providerLabel: "东方财富机构研报",
          required: false,
          status: "success",
          facts: { researchReports: [] },
          expectedFields: ["researchReports"],
          sourceUrl: "https://data.eastmoney.com/report/stock.jshtml?encodeUrl=300346",
          confidence: "high",
          cacheTtlMs: 21_600_000,
          fetchedAt: "2026-07-26T02:00:00.000Z",
          error: "",
          durationMs: 160,
        },
      ],
    };

    await runCompanyProfileSync(
      { stockCode: "300346", categoryId, taskId },
      {
        db,
        lookup: async () => lookupResult,
        organize: async (input) => organizeStockFacts(input),
        now: () => new Date("2026-07-26T02:00:00.000Z"),
      },
    );

    expect(listCompanyFieldFacts(db, "300346")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: "industry",
          value: "电子化学品",
          status: "available",
          sourceUrl: "https://quote.eastmoney.com/sz300346.html",
        }),
        expect.objectContaining({
          fieldKey: "listingDate",
          value: "",
          status: "missing",
        }),
        expect.objectContaining({
          fieldKey: "businessReview",
          value: null,
          status: "failed",
          error: "上游超时",
        }),
        expect.objectContaining({
          fieldKey: "peTtm",
          value: 48.5,
          status: "available",
          provider: "tencent_quote",
        }),
        expect.objectContaining({
          fieldKey: "announcements",
          status: "available",
          provider: "cninfo_announcements",
        }),
        expect.objectContaining({
          fieldKey: "researchReports",
          value: [],
          status: "missing",
          provider: "eastmoney_reports",
        }),
      ]),
    );
    expect(listSourceSnapshots(db, "300346")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "tencent_quote",
          expiresAt: "2026-07-26 02:10:00",
        }),
        expect.objectContaining({
          provider: "cninfo_announcements",
          expiresAt: "2026-07-26 03:00:00",
        }),
      ]),
    );
    expect(getSyncTaskById(db, taskId)).toMatchObject({ status: "partial", progress: 100 });
  });
});
