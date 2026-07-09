import { describe, expect, it } from "vitest";
import { buildIndustryGraph, stableSeed } from "@/lib/industry-graph/adapter";
import type { CategoryNode } from "@/lib/domain/types";

const categories: CategoryNode[] = [
  {
    id: 1,
    name: "半导体",
    parentId: null,
    level: 0,
    sortOrder: 0,
    aliases: [],
    description: "",
    industry: "半导体",
    isActive: true,
    children: [
      {
        id: 2,
        name: "封测",
        parentId: 1,
        level: 1,
        sortOrder: 0,
        aliases: [],
        description: "",
        industry: "半导体",
        isActive: true,
        children: [],
      },
    ],
  },
];

describe("stableSeed", () => {
  it("returns deterministic FNV-style hashes", () => {
    expect(stableSeed("category:1")).toBe(898631264);
    expect(stableSeed("company:002156")).toBe(19726508);
  });
});

describe("buildIndustryGraph", () => {
  it("creates stable category, company, and edge IDs with aggregate stats", () => {
    const graph = buildIndustryGraph(categories, [
      {
        categoryId: 2,
        stockCode: "002156",
        shortName: "通富微电",
        relationType: "主营业务",
        confidence: "高",
        evidenceCount: 12,
      },
    ]);

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "category:1",
      "category:2",
      "company:002156",
    ]);
    expect(graph.edges.map((edge) => edge.id)).toEqual([
      "category:1->category:2",
      "category:2->company:002156",
    ]);
    expect(graph.stats).toEqual({ categoryCount: 2, companyCount: 1, evidenceCount: 12 });
  });

  it("deduplicates companies while retaining every relation and summing evidence", () => {
    const graph = buildIndustryGraph(categories, [
      {
        categoryId: 1,
        stockCode: "002156",
        shortName: "通富微电",
        relationType: "重要相关",
        confidence: "中",
        evidenceCount: 2,
      },
      {
        categoryId: 2,
        stockCode: "002156",
        shortName: "通富微电",
        relationType: "主营业务",
        confidence: "高",
        evidenceCount: 3,
      },
    ]);

    const companyNodes = graph.nodes.filter((node) => node.kind === "company");

    expect(companyNodes).toHaveLength(1);
    expect(companyNodes[0].evidenceCount).toBe(5);
    expect(graph.edges.filter((edge) => edge.kind === "relation")).toHaveLength(2);
    expect(graph.stats).toEqual({ categoryCount: 2, companyCount: 1, evidenceCount: 5 });
  });
});
