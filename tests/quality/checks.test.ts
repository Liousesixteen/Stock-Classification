import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { runQualityChecks } from "@/lib/quality/checks";

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
});
