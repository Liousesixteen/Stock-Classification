import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { listIndustryGraphRelations } from "@/lib/repositories/industryGraph";

function setupDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedSemiconductorData(db);
  return db;
}

describe("listIndustryGraphRelations", () => {
  it("returns seeded relations in deterministic category and stock order", () => {
    const db = setupDb();

    const rows = listIndustryGraphRelations(db);

    expect(rows).toContainEqual({
      categoryId: expect.any(Number),
      stockCode: "688235",
      shortName: "百济神州",
      relationType: "主营业务",
      confidence: "高",
      evidenceCount: 0,
    });
    expect(rows.every((row) => typeof row.evidenceCount === "number" && row.evidenceCount >= 0)).toBe(true);

    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      expect(
        previous.categoryId < current.categoryId ||
          (previous.categoryId === current.categoryId && previous.stockCode <= current.stockCode),
      ).toBe(true);
    }
  });

  it("counts only active evidence and retains relations without evidence", () => {
    const db = setupDb();
    const relation = db
      .prepare(
        `
          select id
          from company_category_relations
          where stock_code = ?
        `,
      )
      .get("688235") as { id: number };

    const insertEvidence = db.prepare(
      `
        insert into evidences (relation_id, source_type, title, is_expired)
        values (?, '公告', ?, ?)
      `,
    );
    insertEvidence.run(relation.id, "有效证据", 0);
    insertEvidence.run(relation.id, "过期证据", 1);

    const rows = listIndustryGraphRelations(db);

    expect(rows.find((row) => row.stockCode === "688235")?.evidenceCount).toBe(1);
    expect(rows).toContainEqual(
      expect.objectContaining({
        stockCode: "600276",
        shortName: "恒瑞医药",
        evidenceCount: 0,
      }),
    );
  });
});
