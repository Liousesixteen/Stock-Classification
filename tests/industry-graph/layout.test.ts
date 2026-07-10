import { describe, expect, it } from "vitest";
import { chooseGraphQuality, createGraphLayout } from "@/lib/industry-graph/layout";
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

  it("selects reduced, balanced and full quality tiers", () => {
    expect(chooseGraphQuality({ hardwareConcurrency: 2, deviceMemory: 8, reducedMotion: false })).toEqual({ tier: "reduced", particlesPerEdge: 0, maxLabels: 24, pixelRatio: 1 });
    expect(chooseGraphQuality({ hardwareConcurrency: 12, deviceMemory: 16, reducedMotion: true }).tier).toBe("reduced");
    expect(chooseGraphQuality({ hardwareConcurrency: 6, deviceMemory: 8, reducedMotion: false })).toEqual({ tier: "balanced", particlesPerEdge: 1, maxLabels: 60, pixelRatio: 1.35 });
    expect(chooseGraphQuality({ hardwareConcurrency: 12, deviceMemory: 16, reducedMotion: false })).toEqual({ tier: "full", particlesPerEdge: 2, maxLabels: 120, pixelRatio: 1.75 });
  });
});
