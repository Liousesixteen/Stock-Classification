import { describe, expect, it } from "vitest";
import { getCompanyChainProfile } from "@/lib/industry-graph/companyChainProfiles";
import { augmentGraphWithCompanyProfile } from "@/lib/industry-graph/companyProfileGraph";
import { createCompanyFocusedGraphLayout, getCompanyFocusedGraphNeighborhood } from "@/lib/industry-graph/layout";
import type { IndustryGraphPayload } from "@/lib/industry-graph/types";

const graph: IndustryGraphPayload = {
  nodes: [
    { id: "category:1", kind: "category", label: "PCB", categoryId: 1, parentId: null, level: 0, layoutSeed: 1 },
    { id: "company:600183", kind: "company", label: "生益科技", stockCode: "600183", relationType: "主营业务", confidence: "高", evidenceCount: 0, layoutSeed: 2 },
    { id: "company:002463", kind: "company", label: "沪电股份", stockCode: "002463", relationType: "主营业务", confidence: "高", evidenceCount: 0, layoutSeed: 3 },
  ],
  edges: [
    { id: "pcb-shengyi", source: "category:1", target: "company:600183", kind: "relation", relationType: "主营业务", confidence: "高", evidenceCount: 0 },
    { id: "pcb-hudian", source: "category:1", target: "company:002463", kind: "relation", relationType: "主营业务", confidence: "高", evidenceCount: 0 },
  ],
  stats: { categoryCount: 1, companyCount: 2, evidenceCount: 0 },
};

describe("structured company chain profile", () => {
  it("groups Shengyi facts into six hubs with real company satellites", () => {
    const profile = getCompanyChainProfile("600183");
    expect(profile?.hubs).toHaveLength(6);
    expect(profile?.hubs.find((hub) => hub.id === "upstream-materials")?.members.map((member) => member.name)).toContain("中国巨石");
    expect(profile?.hubs.find((hub) => hub.id === "direct-customers")?.members.map((member) => member.name)).toContain("沪电股份");

    const enriched = augmentGraphWithCompanyProfile(graph, {
      company: { stockCode: "600183", shortName: "生益科技", fullName: "", board: "沪市主板", industry: "电子材料", region: "广东", marketCapBand: "", intro: "", mainBusiness: "", updatedAt: "2026-08-24" },
      businessLines: [], competitiveAdvantages: [], keyCustomers: [], chainProfile: profile,
    });
    const profileNodes = enriched.nodes.filter((node): node is Extract<IndustryGraphPayload["nodes"][number], { kind: "entity" }> => node.kind === "entity" && Boolean(node.profileRole));
    expect(profileNodes.filter((node) => node.profileRole === "hub")).toHaveLength(6);
    expect(profileNodes.some((node) => node.label === "分部间抵销" || node.label === "地产业务")).toBe(false);

    const neighborhood = getCompanyFocusedGraphNeighborhood(enriched, "600183");
    expect(neighborhood.entityNodeIds.size).toBe(15);
    expect(neighborhood.visibleNodeIds.has("category:1")).toBe(true);
    expect(neighborhood.visibleNodeIds.has("company:002463")).toBe(true);
    const positions = createCompanyFocusedGraphLayout(enriched, "600183");
    const upstream = positions["profile-hub:600183:upstream-materials"];
    const customers = positions["profile-hub:600183:direct-customers"];
    expect(Math.hypot(upstream[0] - customers[0], upstream[1] - customers[1], upstream[2] - customers[2])).toBeGreaterThan(8);
  });
});
