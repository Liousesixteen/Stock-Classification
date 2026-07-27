import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { upsertCompany } from "@/lib/repositories/companies";
import {
  listCompanyFieldFacts,
  setCompanyFieldVerificationStatus,
  upsertCompanyFieldFact,
} from "@/lib/repositories/companyFieldFacts";

function setupDb() {
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
  return db;
}

describe("company field facts", () => {
  it("stores field-level provenance and missing states independently by provider", () => {
    const db = setupDb();

    upsertCompanyFieldFact(db, {
      stockCode: "300346",
      fieldKey: "industry",
      provider: "eastmoney_push2",
      providerLabel: "东方财富 push2 基础资料",
      value: "电子化学品",
      status: "available",
      sourceUrl: "https://quote.eastmoney.com/sz300346.html",
      confidence: "high",
      fetchedAt: "2026-07-26 10:00:00",
    });
    upsertCompanyFieldFact(db, {
      stockCode: "300346",
      fieldKey: "businessReview",
      provider: "eastmoney_f10_business_analysis",
      providerLabel: "东方财富 F10 经营分析",
      status: "missing",
      sourceUrl: "https://emweb.securities.eastmoney.com/",
      confidence: "high",
      fetchedAt: "2026-07-26 10:00:00",
    });

    expect(listCompanyFieldFacts(db, "300346")).toEqual([
      expect.objectContaining({
        fieldKey: "businessReview",
        value: null,
        status: "missing",
        verificationStatus: "unverified",
      }),
      expect.objectContaining({
        fieldKey: "industry",
        value: "电子化学品",
        sourceUrl: "https://quote.eastmoney.com/sz300346.html",
        confidence: "high",
      }),
    ]);
  });

  it("keeps the verification decision when it is explicitly updated", () => {
    const db = setupDb();
    upsertCompanyFieldFact(db, {
      stockCode: "300346",
      fieldKey: "industry",
      provider: "eastmoney_push2",
      providerLabel: "东方财富",
      value: "电子化学品",
      status: "available",
      confidence: "high",
    });

    setCompanyFieldVerificationStatus(db, {
      stockCode: "300346",
      fieldKey: "industry",
      provider: "eastmoney_push2",
      verificationStatus: "verified",
    });
    upsertCompanyFieldFact(db, {
      stockCode: "300346",
      fieldKey: "industry",
      provider: "eastmoney_push2",
      providerLabel: "东方财富",
      value: "电子化学品",
      status: "available",
      confidence: "high",
    });

    expect(listCompanyFieldFacts(db, "300346")[0]).toMatchObject({
      fieldKey: "industry",
      verificationStatus: "verified",
    });
  });

  it("resets verification when the provider value changes", () => {
    const db = setupDb();
    upsertCompanyFieldFact(db, {
      stockCode: "300346",
      fieldKey: "industry",
      provider: "eastmoney_push2",
      providerLabel: "东方财富",
      value: "化学制品",
      status: "available",
      confidence: "high",
    });
    setCompanyFieldVerificationStatus(db, {
      stockCode: "300346",
      fieldKey: "industry",
      provider: "eastmoney_push2",
      verificationStatus: "verified",
    });

    upsertCompanyFieldFact(db, {
      stockCode: "300346",
      fieldKey: "industry",
      provider: "eastmoney_push2",
      providerLabel: "东方财富",
      value: "电子化学品",
      status: "available",
      confidence: "high",
    });

    expect(listCompanyFieldFacts(db, "300346")[0]).toMatchObject({
      value: "电子化学品",
      verificationStatus: "unverified",
    });
  });
});
