import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { getResearchDashboard } from "@/lib/repositories/researchDashboard";

function setupDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedSemiconductorData(db);
  return db;
}

describe("research dashboard repository", () => {
  it("labels untouched sample data as starter examples without inventing active work", () => {
    const dashboard = getResearchDashboard(setupDb());

    expect(dashboard.mode).toBe("starter");
    expect(dashboard.stats.catalogCompanies).toBeGreaterThan(0);
    expect(dashboard.stats.activeCompanies).toBe(0);
    expect(dashboard.stats.effectiveEvidence).toBe(0);
    expect(dashboard.companies.every((company) => company.isStarterExample)).toBe(true);
    expect(dashboard.recentArtifacts).toEqual([]);
  });

  it("uses persisted watchlist, profile and source-backed evidence as real activity", () => {
    const db = setupDb();
    const relation = db.prepare(
      "select id, stock_code as stockCode from company_category_relations order by id limit 1",
    ).get() as { id: number; stockCode: string };
    db.prepare("update company_category_relations set is_watchlist = 1 where id = ?").run(relation.id);
    db.prepare(`
      insert into company_research_profiles (stock_code, summary)
      values (?, '已建立真实研究档案')
    `).run(relation.stockCode);
    db.prepare(`
      insert into evidences (
        relation_id, source_type, title, url, excerpt, credibility, verification_status
      )
      values (?, '公告', '可追溯公告', 'https://example.com/notice', '公开披露', '高', 'unverified')
    `).run(relation.id);

    const dashboard = getResearchDashboard(db);
    expect(dashboard.mode).toBe("active");
    expect(dashboard.stats.activeCompanies).toBe(1);
    expect(dashboard.stats.effectiveEvidence).toBe(1);
    expect(dashboard.companies[0]).toMatchObject({
      stockCode: relation.stockCode,
      evidenceCount: 1,
      hasResearchProfile: true,
      isWatchlist: true,
      isStarterExample: false,
    });
  });
});
