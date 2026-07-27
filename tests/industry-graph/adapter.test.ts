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
        verificationStatus: "verified",
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
    expect(graph.edges[0]).toEqual({ id: "category:1->category:2", source: "category:1", target: "category:2", kind: "hierarchy", evidenceCount: 0 });
    expect(graph.edges[1]).toMatchObject({ id: "category:2->company:002156", source: "category:2", target: "company:002156", kind: "relation", relationType: "主营业务", confidence: "高", evidenceCount: 12, rationale: "", isWatchlist: false, evidencePreviews: [] });
    expect(graph.stats).toEqual({ categoryCount: 2, companyCount: 1, evidenceCount: 12, verifiedRelationCount: 1, unverifiedRelationCount: 0, watchlistCount: 0, entityCount: 0, evidenceNodeCount: 0 });
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
        verificationStatus: "verified",
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
        verificationStatus: "verified",
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
    expect(forwardGraph.stats).toEqual({ categoryCount: 2, companyCount: 1, evidenceCount: 9, verifiedRelationCount: 2, unverifiedRelationCount: 1, watchlistCount: 0, entityCount: 0, evidenceNodeCount: 0 });
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

  it("adds evidence-backed external entities as graph nodes connected to companies", () => {
    const graph = buildIndustryGraph(categories, [
      { categoryId: 2, stockCode: "002156", shortName: "通富微电", relationType: "主营业务", confidence: "高", evidenceCount: 1 },
    ], [
      {
        relationId: 9,
        stockCode: "002156",
        entityId: 88,
        entityType: "产品/技术",
        entityName: "先进封装",
        entitySummary: "封装测试的重要技术方向。",
        relationType: "技术关联",
        confidence: "中",
        rationale: "先进封装技术与公司封测能力直接相关。",
        isWatchlist: true,
        evidenceCount: 1,
        evidencePreviews: [{ id: 3, sourceType: "年报", title: "2025 年报", credibility: "高", sourceDate: "2026-03-01" }],
      },
    ]);

    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: "entity:88", kind: "entity", label: "先进封装", entityType: "产品/技术" }));
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: "evidence:entity:3", kind: "evidence", label: "2025 年报", sourceType: "年报" }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ id: "company:002156->entity:88:9", kind: "entityRelation", relationType: "技术关联", evidenceCount: 1, isWatchlist: true }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "entity:88", target: "evidence:entity:3", kind: "evidenceLink" }));
    expect(graph.stats).toMatchObject({ companyCount: 1, entityCount: 1, evidenceCount: 2, watchlistCount: 1, evidenceNodeCount: 1 });
  });

  it("creates graph-ready company nodes for entity-only relations and never emits dangling edges", () => {
    const graph = buildIndustryGraph(categories, [], [
      {
        relationId: 19,
        stockCode: "600030",
        shortName: "中信证券",
        board: "主板",
        industry: "证券",
        intro: "综合证券服务商。",
        mainBusiness: "投资银行与财富管理",
        entityId: 91,
        entityType: "事件/政策",
        entityName: "资本市场活跃度",
        entitySummary: "券商景气变量。",
        relationType: "政策催化",
        confidence: "中",
        rationale: "成交活跃度影响经纪与两融业务。",
        isWatchlist: false,
        evidenceCount: 0,
        evidencePreviews: [],
        direction: "inbound",
        strength: 72,
        observedAt: "2026-07-26",
      },
    ]);
    const nodeIds = new Set(graph.nodes.map((node) => node.id));

    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: "company:600030", label: "中信证券", industry: "证券" }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "company:600030", target: "entity:91", direction: "inbound", strength: 72 }));
    expect(graph.edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))).toBe(true);
  });

  it("drops category relations whose visible endpoint is absent", () => {
    const graph = buildIndustryGraph(categories, [{
      categoryId: 999,
      stockCode: "002156",
      shortName: "通富微电",
      relationType: "主营业务",
      confidence: "高",
      evidenceCount: 1,
    }]);

    expect(graph.nodes.some((node) => node.id === "company:002156")).toBe(false);
    expect(graph.edges.some((edge) => edge.target === "company:002156")).toBe(false);
  });
});
