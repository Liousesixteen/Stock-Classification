import { describe, expect, it } from "vitest";
import { findResearchPaths } from "@/lib/industry-graph/pathExplorer";
import type { IndustryGraphPayload } from "@/lib/industry-graph/types";

const graph: IndustryGraphPayload = {
  nodes: [
    { id: "category:1", kind: "category", label: "封测", categoryId: 1, parentId: null, level: 0, layoutSeed: 1 },
    { id: "company:1", kind: "company", label: "甲公司", stockCode: "000001", relationType: "主营业务", confidence: "高", evidenceCount: 1, layoutSeed: 2 },
    { id: "company:2", kind: "company", label: "乙公司", stockCode: "000002", relationType: "重要相关", confidence: "中", evidenceCount: 0, layoutSeed: 3 },
    { id: "entity:1", kind: "entity", label: "先进封装", entityId: 1, entityType: "产品/技术", summary: "关键技术方向。", evidenceCount: 2, layoutSeed: 4 },
  ],
  edges: [
    { id: "category:1->company:1", source: "category:1", target: "company:1", kind: "relation", relationType: "主营业务", confidence: "高", evidenceCount: 1, rationale: "主营业务覆盖封测。", isWatchlist: false, evidencePreviews: [{ id: 1, sourceType: "年报", title: "年报", credibility: "高", sourceDate: "" }] },
    { id: "category:1->company:2", source: "category:1", target: "company:2", kind: "relation", relationType: "重要相关", confidence: "中", evidenceCount: 0, rationale: "产业链相关。", isWatchlist: false, evidencePreviews: [] },
    { id: "company:1->entity:1:8", source: "company:1", target: "entity:1", kind: "entityRelation", relationId: 8, relationType: "技术关联", confidence: "高", evidenceCount: 2, rationale: "技术能力关联。", isWatchlist: true, evidencePreviews: [{ id: 2, sourceType: "公告", title: "公告", credibility: "高", sourceDate: "" }, { id: 3, sourceType: "年报", title: "年报", credibility: "高", sourceDate: "" }] },
  ],
  stats: { categoryCount: 1, companyCount: 2, entityCount: 1, evidenceCount: 3, verifiedRelationCount: 2, unverifiedRelationCount: 1, watchlistCount: 1 },
};

describe("findResearchPaths", () => {
  it("finds bounded, explainable paths with independent-source verification", () => {
    const paths = findResearchPaths(graph, "company:1");
    const technologyPath = paths.find((path) => path.nodeIds.at(-1) === "entity:1");
    expect(technologyPath).toMatchObject({ verification: "多源验证", evidenceCount: 2, independentSourceCount: 2 });
    expect(technologyPath?.nextAction).toContain("订单");
  });

  it("marks paths with unsupported links as evidence gaps", () => {
    const paths = findResearchPaths(graph, "company:1", 3);
    const peerPath = paths.find((path) => path.nodeIds.at(-1) === "company:2");
    expect(peerPath).toMatchObject({ verification: "缺证据" });
    expect(peerPath?.nextAction).toContain("补充公告");
  });

  it("never returns cyclic node paths", () => {
    const paths = findResearchPaths(graph, "company:1", 3);
    expect(paths.every((path) => new Set(path.nodeIds).size === path.nodeIds.length)).toBe(true);
  });
});
