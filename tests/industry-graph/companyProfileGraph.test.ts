import { describe, expect, it } from "vitest";
import { augmentGraphWithCompanyProfile, deriveCompanyNarrativeFacts } from "@/lib/industry-graph/companyProfileGraph";
import { getCompanyFocusedGraphNeighborhood } from "@/lib/industry-graph/layout";
import type { IndustryGraphPayload } from "@/lib/industry-graph/types";

const graph: IndustryGraphPayload = {
  nodes: [
    { id: "category:1", kind: "category", label: "封测", categoryId: 1, parentId: null, level: 0, layoutSeed: 1 },
    { id: "company:002156", kind: "company", label: "通富微电", stockCode: "002156", relationType: "主营业务", confidence: "高", evidenceCount: 1, layoutSeed: 2 },
  ],
  edges: [
    { id: "category:1->company:002156", source: "category:1", target: "company:002156", kind: "relation", relationType: "主营业务", confidence: "高", evidenceCount: 1 },
  ],
  stats: { categoryCount: 1, companyCount: 1, evidenceCount: 1 },
};

describe("company profile graph", () => {
  it("turns business, technology and customer facts into bounded star-chain nodes", () => {
    const enriched = augmentGraphWithCompanyProfile(graph, {
      company: {
        stockCode: "002156",
        shortName: "通富微电",
        fullName: "通富微电子股份有限公司",
        board: "深市主板",
        industry: "集成电路封测",
        region: "江苏",
        marketCapBand: "",
        intro: "集成电路封装测试企业",
        mainBusiness: "集成电路封装测试；先进封装",
        updatedAt: "2026-08-24",
      },
      businessLines: [{ name: "集成电路封装测试", share: "80%", grossMargin: "18%" }],
      competitiveAdvantages: ["Chiplet 与先进封装平台"],
      keyCustomers: ["AMD"],
      sourceSummary: "公司年报与公开资料",
    });

    const entityNodes = enriched.nodes.filter((node) => node.kind === "entity");
    const relationEdges = enriched.edges.filter((edge) => edge.kind === "entityRelation");
    expect(entityNodes.map((node) => node.label)).toEqual(expect.arrayContaining(["集成电路封装测试", "Chiplet 与先进封装平台", "AMD"]));
    expect(relationEdges.some((edge) => edge.relationType === "核心产品")).toBe(true);
    expect(relationEdges.some((edge) => edge.relationType === "技术关联")).toBe(true);
    expect(relationEdges.some((edge) => edge.relationType === "客户验证" && edge.direction === "outbound")).toBe(true);

    const defaultView = getCompanyFocusedGraphNeighborhood(enriched, "002156");
    expect(defaultView.entityNodeIds.size).toBe(4);
  });

  it("does not create guessed customer nodes from missing placeholders", () => {
    const enriched = augmentGraphWithCompanyProfile(graph, {
      company: {
        stockCode: "002156",
        shortName: "通富微电",
        fullName: "通富微电子股份有限公司",
        board: "深市主板",
        industry: "集成电路封测",
        region: "江苏",
        marketCapBand: "",
        intro: "",
        mainBusiness: "封装测试",
        updatedAt: "2026-08-24",
      },
      businessLines: [],
      competitiveAdvantages: ["技术待补"],
      keyCustomers: ["客户待补", "暂无披露"],
      sourceSummary: "",
    });

    const customerEdges = enriched.edges.filter((edge) => edge.kind === "entityRelation" && edge.relationType === "客户验证");
    expect(customerEdges).toHaveLength(0);
  });

  it("extracts business and technology only from existing company narrative", () => {
    expect(deriveCompanyNarrativeFacts({
      intro: "国内领先的集成电路封装测试企业，覆盖先进封装与规模化制造。",
      mainBusiness: "当前归类方向：封测。",
    })).toEqual({
      business: ["集成电路封装测试"],
      technology: ["先进封装", "规模化制造"],
    });
  });
});
