import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { buildIndustryResearchFacts, buildOpenQuestionResearchFacts } from "@/lib/research/companyFacts";
import { buildResearchEvidenceCatalog } from "@/lib/research/researchEvidenceCatalog";

describe("universal research facts", () => {
  it("builds an industry-scoped fact package from persisted classifications and evidence", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    seedSemiconductorData(db);
    const category = db.prepare(
      `select category_id as categoryId from company_category_relations group by category_id order by count(*) desc limit 1`,
    ).get() as { categoryId: number };
    const relation = db.prepare(
      `select id from company_category_relations where category_id = ? order by id limit 1`,
    ).get(category.categoryId) as { id: number };
    db.prepare(
      `insert into evidences (relation_id, source_type, title, source_date, url, excerpt, credibility)
       values (?, '公告', '产业验证公告', '2026-07-20', 'https://example.com/notice', '公司披露了相关业务进展。', '高')`,
    ).run(relation.id);

    const facts = buildIndustryResearchFacts(db, category.categoryId);
    expect(facts?.subject).toMatchObject({ kind: "industry", key: String(category.categoryId) });
    expect(facts?.relations.length).toBeGreaterThan(0);
    expect(buildResearchEvidenceCatalog(facts!)).toContainEqual(expect.objectContaining({ title: "产业验证公告", sourceType: "公告" }));
    db.close();
  });

  it("keeps open questions evidence-empty instead of inventing context", () => {
    const facts = buildOpenQuestionResearchFacts("AI 对制造业有哪些可验证影响？");
    expect(facts.subject?.kind).toBe("question");
    expect(facts.evidence).toEqual([]);
    expect(buildResearchEvidenceCatalog(facts)).toEqual([]);
  });
});
