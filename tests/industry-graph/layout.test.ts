import { describe, expect, it } from "vitest";
import { chooseGraphQuality, createFocusedGraphLayout, createGraphLayout, getFocusedGraphNeighborhood } from "@/lib/industry-graph/layout";
import type { IndustryGraphPayload } from "@/lib/industry-graph/types";

const graph: IndustryGraphPayload = {
  nodes: [
    { id: "category:1", kind: "category", label: "半导体", categoryId: 1, parentId: null, level: 0, layoutSeed: 1 },
    { id: "category:2", kind: "category", label: "封测", categoryId: 2, parentId: 1, level: 1, layoutSeed: 2 },
    { id: "category:3", kind: "category", label: "机器人", categoryId: 3, parentId: null, level: 0, layoutSeed: 3 },
    { id: "company:002156", kind: "company", label: "通富微电", stockCode: "002156", relationType: "主营业务", confidence: "高", evidenceCount: 12, layoutSeed: 4 },
  ],
  edges: [
    { id: "category:1->category:2", source: "category:1", target: "category:2", kind: "hierarchy", evidenceCount: 0 },
    { id: "category:2->company:002156", source: "category:2", target: "company:002156", kind: "relation", relationType: "主营业务", confidence: "高", evidenceCount: 12 },
    { id: "category:3->company:002156", source: "category:3", target: "company:002156", kind: "relation", relationType: "重要相关", confidence: "中", evidenceCount: 1 },
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

  it("builds a deterministic local orbit around the focused category", () => {
    const positions = createFocusedGraphLayout(graph, 1);
    expect(positions).toEqual(createFocusedGraphLayout(graph, 1));
    expect(positions["category:1"]).toEqual([0, 0, 0]);
    expect(Math.hypot(...positions["category:2"])).toBeGreaterThan(7);
    expect(Math.hypot(...positions["category:2"])).toBeLessThan(10);
    expect(distance(positions["company:002156"], positions["category:2"])).toBeLessThan(4.5);
    expect(Math.hypot(...positions["category:3"])).toBeGreaterThan(20);
  });

  it("keeps every focused edge attached to two visible, positioned nodes", () => {
    const neighborhood = getFocusedGraphNeighborhood(graph, 1);
    const positions = createFocusedGraphLayout(graph, 1);
    const visibleEdges = graph.edges.filter((edge) => neighborhood.visibleEdgeIds.has(edge.id));

    expect(neighborhood.contextCategoryIds).toEqual(new Set([3]));
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
    const positions = createFocusedGraphLayout(reversed, 1);

    expect(neighborhood.companyNodeIds.has("company:002156")).toBe(true);
    expect(neighborhood.contextCategoryIds).toEqual(new Set([3]));
    expect(positions["company:002156"]).toBeDefined();
    expect(distance(positions["company:002156"], positions["category:2"])).toBeLessThan(4.5);
  });

  it("falls back to the macro layout when the focus does not exist", () => {
    expect(createFocusedGraphLayout(graph, 999)).toEqual(createGraphLayout(graph));
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
