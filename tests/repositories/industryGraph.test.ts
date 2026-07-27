import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { buildIndustryGraph } from "@/lib/industry-graph/adapter";
import { getFocusedGraphNeighborhood } from "@/lib/industry-graph/layout";
import { upsertCompany } from "@/lib/repositories/companies";
import { createCategory, getCategoryTree } from "@/lib/repositories/categories";
import { listIndustryGraphRelations } from "@/lib/repositories/industryGraph";
import { upsertRelation } from "@/lib/repositories/relations";

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

    expect(rows).toContainEqual(expect.objectContaining({
      categoryId: expect.any(Number),
      stockCode: "688235",
      shortName: "百济神州",
      relationType: "主营业务",
      confidence: "高",
      evidenceCount: 0,
      relationId: expect.any(Number),
      rationale: expect.any(String),
      isWatchlist: false,
      evidencePreviews: [],
    }));
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

    const beOne = rows.find((row) => row.stockCode === "688235");
    expect(beOne?.evidenceCount).toBe(1);
    expect(beOne?.evidencePreviews).toEqual([expect.objectContaining({ title: "有效证据", sourceType: "公告" })]);
    expect(rows).toContainEqual(
      expect.objectContaining({
        stockCode: "600276",
        shortName: "恒瑞医药",
        evidenceCount: 0,
      }),
    );
  });

  it("omits relations attached to inactive categories", () => {
    const db = setupDb();
    db.prepare(
      `
        update categories
        set is_active = 0
        where id = (
          select category_id
          from company_category_relations
          where stock_code = ?
        )
      `,
    ).run("688235");

    const rows = listIndustryGraphRelations(db);

    expect(rows.some((row) => row.stockCode === "688235")).toBe(false);
  });

  it("turns a custom category and its stock into distinct live graph nodes", () => {
    const db = setupDb();
    const root = db.prepare("select id from categories where parent_id is null order by id limit 1").get() as { id: number };
    const categoryId = createCategory(db, { name: "锂矿", parentId: root.id, industry: "有色金属" });

    upsertCompany(db, {
      stockCode: "300999",
      shortName: "测试锂业",
      fullName: "测试锂业股份有限公司",
      board: "创业板",
      industry: "有色金属",
      region: "四川",
      marketCapBand: "100-300亿",
      intro: "锂资源开发与锂盐加工企业。",
      mainBusiness: "锂精矿与锂盐产品",
      updatedAt: "",
    });
    upsertRelation(db, {
      stockCode: "300999",
      categoryId,
      relationType: "主营业务",
      confidence: "高",
      rationale: "主营锂资源开发与锂盐加工。",
      isWatchlist: false,
    });

    const graph = buildIndustryGraph(getCategoryTree(db), listIndustryGraphRelations(db));
    const category = graph.nodes.find((node) => node.id === `category:${categoryId}`);
    const company = graph.nodes.find((node) => node.id === "company:300999");
    const neighborhood = getFocusedGraphNeighborhood(graph, categoryId);

    expect(category).toMatchObject({ kind: "category", label: "锂矿" });
    expect(company).toMatchObject({ kind: "company", label: "测试锂业", stockCode: "300999" });
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: `category:${categoryId}`, target: "company:300999", kind: "relation" }),
    );
    expect(neighborhood.visibleNodeIds).toContain("company:300999");
    expect(neighborhood.companyNodeIds).toEqual(new Set(["company:300999"]));
  });
});
