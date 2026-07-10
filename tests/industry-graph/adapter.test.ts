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

    expect(graph.nodes).toEqual([
      {
        id: "category:1",
        kind: "category",
        label: "半导体",
        categoryId: 1,
        parentId: null,
        level: 0,
        layoutSeed: 898631264,
      },
      {
        id: "category:2",
        kind: "category",
        label: "封测",
        categoryId: 2,
        parentId: 1,
        level: 1,
        layoutSeed: 948964121,
      },
      {
        id: "company:002156",
        kind: "company",
        label: "通富微电",
        stockCode: "002156",
        relationType: "主营业务",
        confidence: "高",
        evidenceCount: 12,
        layoutSeed: 19726508,
      },
    ]);
    expect(graph.edges).toEqual([
      {
        id: "category:1->category:2",
        source: "category:1",
        target: "category:2",
        kind: "hierarchy",
        evidenceCount: 0,
      },
      {
        id: "category:2->company:002156",
        source: "category:2",
        target: "company:002156",
        kind: "relation",
        relationType: "主营业务",
        confidence: "高",
        evidenceCount: 12,
      },
    ]);
    expect(graph.stats).toEqual({ categoryCount: 2, companyCount: 1, evidenceCount: 12 });
  });

  it("selects canonical company metadata independent of relation input order", () => {
    const relations = [
      {
        categoryId: 1,
        stockCode: "002156",
        shortName: "通富微电",
        relationType: "重要相关",
        confidence: "高",
        evidenceCount: 2,
      },
      {
        categoryId: 2,
        stockCode: "002156",
        shortName: "通富微电",
        relationType: "主营业务",
        confidence: "低",
        evidenceCount: 3,
      },
      {
        categoryId: 1,
        stockCode: "002156",
        shortName: "通富微电",
        relationType: "主营业务",
        confidence: "高",
        evidenceCount: 4,
      },
    ] as const;

    const forwardGraph = buildIndustryGraph(categories, [...relations]);
    const reversedGraph = buildIndustryGraph(categories, [...relations].reverse());
    const forwardCompany = forwardGraph.nodes.find((node) => node.kind === "company");
    const reversedCompany = reversedGraph.nodes.find((node) => node.kind === "company");

    expect(forwardCompany).toEqual({
      id: "company:002156",
      kind: "company",
      label: "通富微电",
      stockCode: "002156",
      relationType: "主营业务",
      confidence: "高",
      evidenceCount: 9,
      layoutSeed: 19726508,
    });
    expect(reversedCompany).toEqual(forwardCompany);
    expect(forwardGraph.edges.filter((edge) => edge.kind === "relation")).toHaveLength(3);
    expect(reversedGraph.edges.filter((edge) => edge.kind === "relation")).toHaveLength(3);
    expect(forwardGraph.stats).toEqual({ categoryCount: 2, companyCount: 1, evidenceCount: 9 });
    expect(reversedGraph.stats).toEqual(forwardGraph.stats);
  });

  it("does not mutate category or relation inputs", () => {
    const categoryInput = structuredClone(categories);
    const relationInput = [
      {
        categoryId: 2,
        stockCode: "002156",
        shortName: "通富微电",
        relationType: "主营业务" as const,
        confidence: "高" as const,
        evidenceCount: 12,
      },
    ];
    const categorySnapshot = structuredClone(categoryInput);
    const relationSnapshot = structuredClone(relationInput);

    buildIndustryGraph(categoryInput, relationInput);

    expect(categoryInput).toEqual(categorySnapshot);
    expect(relationInput).toEqual(relationSnapshot);
  });
});
