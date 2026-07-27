import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { createCompanyGraphEntityRelation, listCompanyGraphEntityRelations, listIndustryGraphEntityRelations } from "@/lib/repositories/graphEntities";

function setupDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedSemiconductorData(db);
  return db;
}

describe("company graph entities", () => {
  it("stores a typed external entity with an evidence-backed company relationship", () => {
    const db = setupDb();
    const relation = createCompanyGraphEntityRelation(db, {
      stockCode: "600030",
      entityType: "事件/政策",
      entityName: "资本市场活跃度提升",
      entitySummary: "影响券商经纪、两融和投行业务景气度的市场变量。",
      relationType: "政策催化",
      confidence: "中",
      rationale: "市场活跃度改善通常会提升券商经纪与两融业务活跃度，需跟踪成交额和公告验证。",
      isWatchlist: true,
      direction: "inbound",
      strength: 78,
      observedAt: "2026-07-11",
      evidence: { sourceType: "手动备注", title: "研究假设记录", sourceDate: "2026-07-11", url: "https://example.com/research-hypothesis", excerpt: "将市场活跃度作为券商景气跟踪变量。", credibility: "中" },
    });

    expect(relation).toMatchObject({ stockCode: "600030", entityType: "事件/政策", entityName: "资本市场活跃度提升", relationType: "政策催化", isWatchlist: true, direction: "inbound", strength: 78, observedAt: "2026-07-11", evidenceCount: 1 });
    expect(relation.evidencePreviews).toEqual([expect.objectContaining({ title: "研究假设记录" })]);
  });

  it("reuses the typed entity while keeping relation evidence append-only", () => {
    const db = setupDb();
    const input = {
      stockCode: "600030", entityType: "产品/技术" as const, entityName: "投行与财富管理平台", entitySummary: "券商综合服务能力。", relationType: "核心产品" as const, confidence: "高" as const, rationale: "公司主营业务覆盖投行和财富管理服务。", isWatchlist: false,
      direction: "outbound" as const, strength: 91, observedAt: "2026-07-18",
      evidence: { sourceType: "年报" as const, title: "2025 年报", sourceDate: "2026-03-01", url: "https://example.com/annual-report", excerpt: "主营业务披露。", credibility: "高" as const },
    };
    createCompanyGraphEntityRelation(db, input);
    createCompanyGraphEntityRelation(db, {
      ...input,
      direction: undefined,
      strength: undefined,
      observedAt: undefined,
      rationale: "第二次补充关系说明。",
      evidence: { ...input.evidence, title: "2025 年报补充" },
    });

    const relations = listCompanyGraphEntityRelations(db, "600030");
    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({ rationale: "第二次补充关系说明。", direction: "outbound", strength: 91, observedAt: "2026-07-18", evidenceCount: 2 });
  });

  it("exposes external company links in a graph-ready shape", () => {
    const db = setupDb();
    createCompanyGraphEntityRelation(db, {
      stockCode: "600030", entityType: "事件/政策", entityName: "市场活跃度", entitySummary: "券商景气变量。", relationType: "政策催化", confidence: "中", rationale: "市场活跃度会影响券商经纪与两融业务。", isWatchlist: false,
      evidence: { sourceType: "手动备注", title: "研究记录", sourceDate: "", url: "https://example.com/research-note", excerpt: "跟踪成交额。", credibility: "中" },
    });
    expect(listIndustryGraphEntityRelations(db)).toContainEqual(expect.objectContaining({ relationId: expect.any(Number), stockCode: "600030", shortName: "中信证券", entityName: "市场活跃度", direction: "undirected", evidenceCount: 1 }));
  });
});
