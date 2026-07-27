import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { findCategoryByPath } from "@/lib/repositories/categories";
import { setRelationWatchlist } from "@/lib/repositories/relations";
import { getDefaultSectorCategoryId, getSectorResearch } from "@/lib/repositories/sectorResearch";

function setupDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedSemiconductorData(db);
  return db;
}

describe("sector research repository", () => {
  it("builds a sector-level view with companies, path and research coverage", () => {
    const db = setupDb();
    const category = findCategoryByPath(db, ["创新药"]);
    expect(category).toBeDefined();

    const sector = getSectorResearch(db, category!.id);

    expect(sector?.path.map((item) => item.name)).toEqual(["创新药"]);
    expect(sector?.companies.length).toBeGreaterThan(0);
    expect(sector?.companies.every((company) => company.categoryNames.length > 0)).toBe(true);
    expect(sector?.stats.companyCount).toBe(sector?.companies.length);
    expect(sector?.stats.profileCoverage).toBe(0);
    expect(sector?.companies.every((company) => !company.hasResearchProfile)).toBe(true);
  });

  it("chooses an active leaf as a default sector", () => {
    const db = setupDb();
    const categoryId = getDefaultSectorCategoryId(db);
    expect(categoryId).toEqual(expect.any(Number));
    expect(getSectorResearch(db, categoryId!)).not.toBeNull();
  });

  it("exposes relation-level watchlist state in the sector company matrix", () => {
    const db = setupDb();
    const category = findCategoryByPath(db, ["创新药"])!;
    const before = getSectorResearch(db, category.id)!;
    const company = before.companies[0];

    expect(setRelationWatchlist(db, company.relationId, true)).toBe(1);
    const after = getSectorResearch(db, category.id)!;
    expect(after.companies.find((item) => item.stockCode === company.stockCode)?.isWatchlist).toBe(true);
  });
});
