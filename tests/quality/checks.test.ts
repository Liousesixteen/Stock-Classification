import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { runQualityChecks } from "@/lib/quality/checks";
import { upsertCompany } from "@/lib/repositories/companies";
import { upsertCompanyResearchProfile } from "@/lib/repositories/researchProfiles";

describe("quality checks", () => {
  it("reports missing company intro and missing evidence", () => {
    const db = new Database(":memory:");
    migrate(db);
    seedSemiconductorData(db);
    db.prepare("insert into companies (stock_code, short_name) values (?, ?)").run("300655", "晶瑞电材");
    const category = db.prepare("select id from categories where name = ?").get("KrF 光刻胶") as { id: number };
    db.prepare(`
      insert into company_category_relations (stock_code, category_id, relation_type, confidence, rationale)
      values (?, ?, ?, ?, ?)
    `).run("300655", category.id, "主营业务", "高", "光刻胶及配套电子化学品");

    const checks = runQualityChecks(db);

    expect(checks.some((item) => item.type === "缺公司简介")).toBe(true);
    expect(checks.some((item) => item.type === "缺证据")).toBe(true);
  });

  it("reports low-confidence and watchlist relations", () => {
    const db = new Database(":memory:");
    migrate(db);
    seedSemiconductorData(db);
    db.prepare("insert into companies (stock_code, short_name, intro) values (?, ?, ?)").run("300655", "晶瑞电材", "简介");
    const category = db.prepare("select id from categories where name = ?").get("EUV 光刻胶") as { id: number };
    db.prepare(`
      insert into company_category_relations (stock_code, category_id, relation_type, confidence, rationale, is_watchlist)
      values (?, ?, ?, ?, ?, ?)
    `).run("300655", category.id, "待验证", "低", "仍需确认", 1);

    const checks = runQualityChecks(db);

    expect(checks.some((item) => item.type === "低确信度")).toBe(true);
    expect(checks.some((item) => item.type === "待验证关系")).toBe(true);
  });

  it("reports incomplete structured research profile fields", () => {
    const db = new Database(":memory:");
    migrate(db);
    seedSemiconductorData(db);
    upsertCompany(db, {
      stockCode: "600584",
      shortName: "长电科技",
      fullName: "",
      board: "沪市主板",
      industry: "半导体",
      region: "",
      marketCapBand: "",
      intro: "简介",
      mainBusiness: "封测业务",
      updatedAt: "",
    });
    upsertCompanyResearchProfile(db, {
      stockCode: "600584",
      summary: "封测业务",
      businessLines: [{ name: "封装测试", share: "占比待补", grossMargin: "毛利率待补" }],
      chainPosition: ["封测"],
      competitiveAdvantages: ["先进封装"],
      keyCustomers: ["客户待补"],
      catalysts: [],
      risks: [],
      sourceSummary: "自动同步资料",
    });

    const checks = runQualityChecks(db);

    expect(checks.some((item) => item.type === "缺业务占比" && item.stockCode === "600584")).toBe(true);
    expect(checks.some((item) => item.type === "缺毛利率" && item.stockCode === "600584")).toBe(true);
    expect(checks.some((item) => item.type === "缺核心客户" && item.stockCode === "600584")).toBe(true);
  });
});
