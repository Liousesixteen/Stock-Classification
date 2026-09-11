import { describe, expect, it } from "vitest";
import { chooseGraphQuality, createCompanyFocusedGraphLayout, createFocusedGraphLayout, createGraphLayout, getCompanyFocusedGraphNeighborhood, getFocusedGraphNeighborhood, getOverviewGraphNeighborhood } from "@/lib/industry-graph/layout";
import type { IndustryGraphPayload } from "@/lib/industry-graph/types";

const graph: IndustryGraphPayload = {
  nodes: [
    { id: "category:1", kind: "category", label: "半导体", categoryId: 1, parentId: null, level: 0, layoutSeed: 1 },
    { id: "category:2", kind: "category", label: "封测", categoryId: 2, parentId: 1, level: 1, layoutSeed: 2 },
    { id: "category:3", kind: "category", label: "机器人", categoryId: 3, parentId: null, level: 0, layoutSeed: 3 },
    { id: "company:002156", kind: "company", label: "通富微电", stockCode: "002156", relationType: "主营业务", confidence: "高", evidenceCount: 12, layoutSeed: 4 },
    { id: "company:600584", kind: "company", label: "长电科技", stockCode: "600584", relationType: "主营业务", confidence: "高", evidenceCount: 2, layoutSeed: 5 },
    { id: "entity:10", kind: "entity", label: "先进封装", entityId: 10, entityType: "产品/技术", summary: "先进封装平台", evidenceCount: 1, layoutSeed: 6 },
  ],
  edges: [
    { id: "category:1->category:2", source: "category:1", target: "category:2", kind: "hierarchy", evidenceCount: 0 },
    { id: "category:2->company:002156", source: "category:2", target: "company:002156", kind: "relation", relationType: "主营业务", confidence: "高", evidenceCount: 12 },
    { id: "category:3->company:002156", source: "category:3", target: "company:002156", kind: "relation", relationType: "重要相关", confidence: "中", evidenceCount: 1 },
    { id: "category:2->company:600584", source: "category:2", target: "company:600584", kind: "relation", relationType: "主营业务", confidence: "高", evidenceCount: 1 },
    { id: "company:600584->entity:10", source: "company:600584", target: "entity:10", kind: "entityRelation", relationId: 10, relationType: "核心产品", confidence: "高", evidenceCount: 1, rationale: "先进封装技术平台", isWatchlist: false, evidencePreviews: [], direction: "undirected", strength: 95, observedAt: "2025-08-20", verificationStatus: "verified" },
  ],
  stats: { categoryCount: 3, companyCount: 1, evidenceCount: 13 },
};

describe("industry graph layout", () => {
  it("returns deterministic finite positions for every node", () => {
    const first = createGraphLayout(graph);
    expect(first).toEqual(createGraphLayout(graph));
    expect(first["category:1"]).toEqual([0, 0, 0]);
    expect(Object.keys(first)).toHaveLength(graph.nodes.length);
    expect(Object.values(first).every((position) => position.every(Number.isFinite))).toBe(true);
  });

  it("separates roots and assigns one stable company position", () => {
    const positions = createGraphLayout(graph);
    expect(positions["category:3"]).not.toEqual(positions["category:1"]);
    expect(Object.keys(positions).filter((id) => id === "company:002156")).toHaveLength(1);
  });

  it("handles empty graphs", () => {
    expect(createGraphLayout({ nodes: [], edges: [], stats: { categoryCount: 0, companyCount: 0, evidenceCount: 0 } })).toEqual({});
  });

  it("completes the overview with taxonomy tiers and representative root companies", () => {
    const overview = getOverviewGraphNeighborhood(graph);

    expect(overview.visibleNodeIds.has("category:1")).toBe(true);
    expect(overview.visibleNodeIds.has("category:2")).toBe(true);
    expect(overview.visibleNodeIds.has("category:3")).toBe(true);
    expect(overview.representativeCompanyNodeIds.has("company:002156")).toBe(true);
    expect(overview.visibleEdgeIds.has("category:1->category:2")).toBe(true);
    expect(overview.visibleEdgeIds.has("category:3->company:002156")).toBe(true);
    expect(overview.visibleNodeIds.has("entity:10")).toBe(false);
  });

  it("builds a deterministic local orbit around the focused category", () => {
    const positions = createFocusedGraphLayout(graph, 1);
    expect(positions).toEqual(createFocusedGraphLayout(graph, 1));
    expect(positions["category:1"]).toEqual([0, 0, 0]);
    expect(Math.hypot(...positions["category:2"])).toBeGreaterThan(7);
    expect(Math.hypot(...positions["category:2"])).toBeLessThan(10);
    expect(getFocusedGraphNeighborhood(graph, 1).companyNodeIds).toEqual(new Set());
    const leafPositions = createFocusedGraphLayout(graph, 2);
    expect(distance(leafPositions["company:002156"], leafPositions["category:2"])).toBeLessThan(8);
    expect(Math.hypot(...positions["category:3"])).toBeGreaterThan(20);
  });

  it("keeps every focused edge attached to two visible, positioned nodes", () => {
    const neighborhood = getFocusedGraphNeighborhood(graph, 1);
    const positions = createFocusedGraphLayout(graph, 1);
    const visibleEdges = graph.edges.filter((edge) => neighborhood.visibleEdgeIds.has(edge.id));

    expect(neighborhood.contextCategoryIds).toEqual(new Set());
    expect(visibleEdges.length).toBeGreaterThan(0);
    expect(neighborhood.visibleNodeIds.has("category:3")).toBe(false);
    expect(neighborhood.visibleEdgeIds.has("category:3->company:002156")).toBe(false);
    expect(visibleEdges.every((edge) => neighborhood.visibleNodeIds.has(edge.source) && neighborhood.visibleNodeIds.has(edge.target))).toBe(true);
    expect(visibleEdges.every((edge) => positions[edge.source] && positions[edge.target])).toBe(true);
    expect([...neighborhood.visibleNodeIds].every((nodeId) => Math.hypot(...positions[nodeId]) <= 11.801)).toBe(true);
  });

  it("treats reversed relation edges as category-to-company relationships", () => {
    const reversed: IndustryGraphPayload = {
      ...graph,
      edges: graph.edges.map((edge) => edge.kind === "relation" ? { ...edge, source: edge.target, target: edge.source } : edge),
    };
    const neighborhood = getFocusedGraphNeighborhood(reversed, 1);

    expect(neighborhood.companyNodeIds.has("company:002156")).toBe(false);
    expect(neighborhood.contextCategoryIds).toEqual(new Set());
    const leafNeighborhood = getFocusedGraphNeighborhood(reversed, 2);
    const leafPositions = createFocusedGraphLayout(reversed, 2);
    expect(leafNeighborhood.companyNodeIds.has("company:002156")).toBe(true);
    expect(distance(leafPositions["company:002156"], leafPositions["category:2"])).toBeLessThan(8);
  });

  it("falls back to the macro layout when the focus does not exist", () => {
    expect(createFocusedGraphLayout(graph, 999)).toEqual(createGraphLayout(graph));
  });

  it("centers a selected company, previews key facts, and progressively expands one relationship branch", () => {
    const neighborhood = getCompanyFocusedGraphNeighborhood(graph, "600584");
    const expanded = getCompanyFocusedGraphNeighborhood(graph, "600584", "core");
    const positions = createCompanyFocusedGraphLayout(graph, "600584", "core");
    expect(positions["company:600584"]).toEqual([0, 0, 0]);
    expect(neighborhood.entityNodeIds.has("entity:10")).toBe(true);
    expect(neighborhood.peerCompanyNodeIds.has("company:002156")).toBe(true);
    expect(neighborhood.contextCategoryIds.has(1)).toBe(true);
    expect(neighborhood.visibleEdgeIds.has("category:1->category:2")).toBe(true);
    expect(expanded.entityNodeIds.has("entity:10")).toBe(true);
    expect(expanded.visibleEdgeIds.has("company:600584->entity:10")).toBe(true);
    expect(Math.hypot(...positions["entity:10"])).toBeLessThan(13);
  });

  it("keeps major company categories apart and distributes peers around the company orbit", () => {
    const companyGraph: IndustryGraphPayload = {
      ...graph,
      nodes: [
        ...graph.nodes,
        { id: "category:4", kind: "category", label: "材料", categoryId: 4, parentId: 1, level: 1, layoutSeed: 14 },
        { id: "company:600206", kind: "company", label: "有研新材", stockCode: "600206", relationType: "主营业务", confidence: "高", evidenceCount: 2, layoutSeed: 15 },
      ],
      edges: [
        ...graph.edges,
        { id: "category:4->company:600584", source: "category:4", target: "company:600584", kind: "relation", relationType: "重要相关", confidence: "中", evidenceCount: 1 },
        { id: "category:4->company:600206", source: "category:4", target: "company:600206", kind: "relation", relationType: "主营业务", confidence: "高", evidenceCount: 2 },
      ],
    };
    const positions = createCompanyFocusedGraphLayout(companyGraph, "600584");
    expect(distance(positions["category:2"], positions["category:4"])).toBeGreaterThan(12);
    expect(Math.hypot(...positions["company:002156"])).toBeGreaterThan(10);
    expect(Math.hypot(...positions["company:600206"])).toBeGreaterThan(10);
    expect(distance(positions["company:002156"], positions["company:600206"])).toBeGreaterThan(20);
  });

  it("selects reduced, balanced and full quality tiers", () => {
    expect(chooseGraphQuality({ hardwareConcurrency: 2, deviceMemory: 8, reducedMotion: false })).toEqual({ tier: "reduced", particlesPerEdge: 0, maxLabels: 24, pixelRatio: 1 });
    expect(chooseGraphQuality({ hardwareConcurrency: 12, deviceMemory: 16, reducedMotion: true }).tier).toBe("reduced");
    expect(chooseGraphQuality({ hardwareConcurrency: 6, deviceMemory: 8, reducedMotion: false })).toEqual({ tier: "balanced", particlesPerEdge: 1, maxLabels: 60, pixelRatio: 1.35 });
    expect(chooseGraphQuality({ hardwareConcurrency: 12, deviceMemory: 16, reducedMotion: false })).toEqual({ tier: "full", particlesPerEdge: 2, maxLabels: 120, pixelRatio: 1.75 });
  });
});

function distance(left: [number, number, number], right: [number, number, number]) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}
