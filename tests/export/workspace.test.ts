import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { createWorkspaceExport } from "@/lib/export/workspace";

function setupDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedSemiconductorData(db);
  return db;
}

describe("workspace export", () => {
  it("creates a portable full JSON backup", () => {
    const payload = JSON.parse(createWorkspaceExport(setupDb(), "json")) as { formatVersion: number; companies: unknown[]; relations: unknown[] };
    expect(payload.formatVersion).toBe(4);
    expect(payload.companies.length).toBeGreaterThan(0);
    expect(payload.relations.length).toBeGreaterThan(0);
  });

  it("creates a spreadsheet-friendly relationship matrix", () => {
    const db = setupDb();
    db.prepare("update company_category_relations set rationale = ? where id = (select min(id) from company_category_relations)").run("=HYPERLINK(\"https://example.com\")");
    const csv = createWorkspaceExport(db, "csv");
    expect(csv).toContain("股票代码,公司简称,当前分类");
    expect(csv).toContain("600030");
    expect(csv).toContain("'=HYPERLINK");
  });
});
