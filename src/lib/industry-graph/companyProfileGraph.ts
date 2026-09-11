import type { Company } from "@/lib/domain/types";
import type { BusinessLine } from "@/lib/repositories/researchProfiles";
import type { IndustryGraphEdge, IndustryGraphNode, IndustryGraphPayload } from "./types";
import type { CompanyChainProfile } from "./companyChainProfiles";

export type CompanyProfileGraphInput = {
  company: Company;
  businessLines: BusinessLine[];
  competitiveAdvantages: string[];
  keyCustomers: string[];
  sourceSummary?: string;
  chainProfile?: CompanyChainProfile | null;
};

export type CompanyNarrativeFacts = {
  business: string[];
  technology: string[];
};

type ProfileRelation = {
  branch: "core-business" | "core-technology" | "customer";
  label: string;
  summary: string;
  entityType: Extract<IndustryGraphNode, { kind: "entity" }>["entityType"];
  relationType: Extract<IndustryGraphEdge, { kind: "entityRelation" }>["relationType"];
  direction: Extract<IndustryGraphEdge, { kind: "entityRelation" }>["direction"];
};

/**
 * Adds bounded, profile-backed company knowledge nodes to the client-side scene.
 * These are not presented as verified evidence: the right inspector keeps their
 * source status explicit and the graph never invents supplier/customer names.
 */
export function augmentGraphWithCompanyProfile(
  graph: IndustryGraphPayload,
  input: CompanyProfileGraphInput,
): IndustryGraphPayload {
  const companyNodeId = `company:${input.company.stockCode}`;
  if (!graph.nodes.some((node) => node.id === companyNodeId)) return graph;

  if (input.chainProfile) return augmentGraphWithStructuredChain(graph, companyNodeId, input.chainProfile);

  const existingEntityLabels = new Set(
    graph.edges.flatMap((edge) => {
      if (edge.kind !== "entityRelation" || edge.source !== companyNodeId) return [];
      const node = graph.nodes.find((candidate) => candidate.id === edge.target && candidate.kind === "entity");
      return node?.kind === "entity" ? [normalizeFact(node.label)] : [];
    }),
  );
  const relations = buildProfileRelations(input)
    .filter((relation) => !existingEntityLabels.has(normalizeFact(relation.label)))
    .slice(0, 12);
  if (!relations.length) return graph;

  const additions = relations.map((relation, index) => {
    const key = `${relation.branch}:${normalizeFact(relation.label)}`;
    const entityId = -Math.max(1, stableHash(`${input.company.stockCode}:${key}`));
    const nodeId = `profile-entity:${input.company.stockCode}:${stableHash(key)}`;
    const confidence = input.sourceSummary?.trim() ? "中" as const : "低" as const;
    const node: Extract<IndustryGraphNode, { kind: "entity" }> = {
      id: nodeId,
      kind: "entity",
      label: relation.label,
      entityId,
      entityType: relation.entityType,
      summary: relation.summary,
      evidenceCount: 0,
      layoutSeed: stableHash(nodeId),
    };
    const edge: Extract<IndustryGraphEdge, { kind: "entityRelation" }> = {
      id: `profile-edge:${input.company.stockCode}:${stableHash(key)}`,
      source: companyNodeId,
      target: nodeId,
      kind: "entityRelation",
      relationId: entityId - index,
      relationType: relation.relationType,
      confidence,
      evidenceCount: 0,
      rationale: relation.summary,
      isWatchlist: false,
      evidencePreviews: [],
      direction: relation.direction,
      strength: relation.branch === "customer" ? 64 : relation.branch === "core-technology" ? 72 : 76,
      observedAt: input.company.updatedAt || "",
      verificationStatus: "unverified",
    };
    return { node, edge };
  });

  return {
    ...graph,
    nodes: [...graph.nodes, ...additions.map((addition) => addition.node)],
    edges: [...graph.edges, ...additions.map((addition) => addition.edge)],
    stats: {
      ...graph.stats,
      entityCount: (graph.stats.entityCount ?? 0) + additions.length,
      unverifiedRelationCount: (graph.stats.unverifiedRelationCount ?? 0) + additions.length,
    },
  };
}

function augmentGraphWithStructuredChain(graph: IndustryGraphPayload, companyNodeId: string, profile: CompanyChainProfile): IndustryGraphPayload {
  const nodes: Array<Extract<IndustryGraphNode, { kind: "entity" }>> = [];
  const edges: Array<Extract<IndustryGraphEdge, { kind: "entityRelation" }>> = [];
  const observedAt = "2026-08-24";

  profile.hubs.forEach((hub, hubIndex) => {
    const hubId = `profile-hub:${profile.stockCode}:${hub.id}`;
    const hubEntityId = -Math.max(1, stableHash(hubId));
    nodes.push({
      id: hubId,
      kind: "entity",
      label: hub.title,
      entityId: hubEntityId,
      entityType: hub.branch === "organization" ? "项目/产能" : hub.branch === "core" ? "产品/技术" : "客户/供应商",
      summary: `${hub.subtitle}。${hub.summary}`,
      evidenceCount: 0,
      layoutSeed: stableHash(hubId),
      profileRole: "hub",
      profileBranch: hub.branch,
      facts: hub.facts,
    });
    edges.push({
      id: `profile-edge:${profile.stockCode}:${hub.id}`,
      source: companyNodeId,
      target: hubId,
      kind: "entityRelation",
      relationId: hubEntityId - hubIndex,
      relationType: hub.relationType,
      confidence: "中",
      evidenceCount: 0,
      rationale: `${hub.summary}（来源：${profile.sourceLabel}）`,
      isWatchlist: false,
      evidencePreviews: [],
      direction: hub.direction,
      strength: 84 - hubIndex,
      observedAt,
      verificationStatus: "unverified",
    });

    hub.members.forEach((member, memberIndex) => {
      const memberKey = `${hub.id}:${member.stockCode ?? member.name}`;
      const memberId = `profile-member:${profile.stockCode}:${stableHash(memberKey)}`;
      const memberEntityId = -Math.max(1, stableHash(memberId));
      nodes.push({
        id: memberId,
        kind: "entity",
        label: member.name,
        entityId: memberEntityId,
        entityType: "客户/供应商",
        summary: member.note ? `${member.note}；关联生益科技${hub.title}` : `关联生益科技${hub.title}`,
        evidenceCount: 0,
        layoutSeed: stableHash(memberId),
        profileRole: "member",
        profileBranch: hub.branch,
        parentNodeId: hubId,
      });
      edges.push({
        id: `profile-member-edge:${profile.stockCode}:${stableHash(memberKey)}`,
        source: hubId,
        target: memberId,
        kind: "entityRelation",
        relationId: memberEntityId - memberIndex,
        relationType: hub.relationType,
        confidence: "中",
        evidenceCount: 0,
        rationale: `${member.name}${member.note ? `：${member.note}` : ""}（来源：${profile.sourceLabel}）`,
        isWatchlist: false,
        evidencePreviews: [],
        direction: hub.direction,
        strength: 66 - Math.min(memberIndex, 10),
        observedAt,
        verificationStatus: "unverified",
      });
    });
  });

  return {
    ...graph,
    nodes: [...graph.nodes, ...nodes],
    edges: [...graph.edges, ...edges],
    stats: {
      ...graph.stats,
      entityCount: (graph.stats.entityCount ?? 0) + nodes.length,
      unverifiedRelationCount: (graph.stats.unverifiedRelationCount ?? 0) + edges.length,
    },
  };
}

function buildProfileRelations(input: CompanyProfileGraphInput): ProfileRelation[] {
  const narrativeFacts = deriveCompanyNarrativeFacts(input.company);
  const businessLines = dedupeFacts(input.businessLines
    .filter((line) => isUsefulFact(line.name) && !isClassificationOnly(line.name))
    .map((line) => ({
      label: compactLabel(line.name),
      summary: [line.name, usefulMetric("收入占比", line.share), usefulMetric("毛利率", line.grossMargin)].filter(Boolean).join(" · "),
    })));
  const fallbackBusiness = dedupeFacts(narrativeFacts.business.map((label) => ({
    label: compactLabel(label),
    summary: `公司公开简介或主营描述提及：${label}`,
  })));
  const technologies = dedupeFacts([
    ...input.competitiveAdvantages
      .filter((value) => isUsefulFact(value) && isSpecificTechnologyFact(value))
      .map((advantage) => ({ label: compactLabel(advantage), summary: `公司档案记录的核心技术或竞争能力：${advantage}` })),
    ...narrativeFacts.technology.map((advantage) => ({ label: compactLabel(advantage), summary: `公司公开简介或主营描述提及的工艺、技术或能力：${advantage}` })),
  ]);
  const customers = dedupeFacts(input.keyCustomers
    .filter(isUsefulFact)
    .map((customer) => ({ label: compactLabel(customer), summary: `公司档案记录的客户或供货对象：${customer}` })));

  return [
    ...dedupeFacts([...businessLines, ...fallbackBusiness]).slice(0, 4).map((item): ProfileRelation => ({
      branch: "core-business",
      ...item,
      entityType: "产品/技术",
      relationType: "核心产品",
      direction: "undirected",
    })),
    ...technologies.slice(0, 4).map((item): ProfileRelation => ({
      branch: "core-technology",
      ...item,
      entityType: "产品/技术",
      relationType: "技术关联",
      direction: "undirected",
    })),
    ...customers.slice(0, 4).map((item): ProfileRelation => ({
      branch: "customer",
      ...item,
      entityType: "客户/供应商",
      relationType: "客户验证",
      direction: "outbound",
    })),
  ];
}

/** Extracts phrases already present in the local dossier without upgrading
 * industry/concept labels into unsupported business claims. */
export function deriveCompanyNarrativeFacts(company: Pick<Company, "intro" | "mainBusiness">): CompanyNarrativeFacts {
  const phrases = [company.intro, company.mainBusiness]
    .flatMap((value) => value.split(/[；;。，,\n]/))
    .flatMap(expandNarrativePhrase)
    .map(cleanNarrativePhrase)
    .filter((value) => isUsefulFact(value) && !isClassificationOnly(value));
  return {
    business: dedupeStrings(phrases.filter((value) => !looksLikeTechnology(value))).slice(0, 4),
    technology: dedupeStrings(phrases.filter(looksLikeTechnology)).slice(0, 5),
  };
}

function expandNarrativePhrase(value: string) {
  const normalized = value.trim();
  if (!normalized) return [];
  const withoutLead = normalized.replace(/^(公司)?(主要)?(主营业务|业务|产品|服务)?(包括|涵盖|覆盖|为|是|聚焦于|专注于|从事)?[：:\s]*/u, "");
  return withoutLead.split(/[、]/).flatMap((item) => {
    const covered = /覆盖/.test(item) ? item.split(/覆盖/) : [item];
    return covered.flatMap((segment) => /[与和及]/.test(segment) && segment.length <= 24 ? segment.split(/[与和及]/) : [segment]);
  });
}

function cleanNarrativePhrase(value: string) {
  return value
    .trim()
    .replace(/^.*?\(证券代码[:：][^)]+\)是/u, "")
    .replace(/^为全球客户提供/u, "")
    .replace(/^通富微电(的)?/u, "")
    .replace(/^(产品|服务)(全方位)?涵盖/u, "")
    .replace(/^是(中国|国内)?/u, "")
    .replace(/^(公司|国内|中国)(领先的|领先|主要)?/u, "")
    .replace(/^[：:、，,；;\s]+|[：:、，,；;\s]+$/g, "")
    .replace(/(提供商|供应商)$/u, "服务")
    .replace(/的?(企业|公司)$/u, "");
}

function looksLikeTechnology(value: string) {
  return /(技术|工艺|平台|产能|制造|研发|能力|先进|仿真|Chiplet|晶圆|制程|算法|系统)/i.test(value);
}

function isSpecificTechnologyFact(value: string) {
  return /(技术|工艺|平台|仿真|Chiplet|晶圆|制程|算法|先进封装|方案)/i.test(value)
    && !/(总部|基地|客户携手|国家政策|市场拉动|降本|成本管控)/.test(value);
}

function isClassificationOnly(value: string) {
  const normalized = value.trim();
  return /^(当前归类方向|东财行业|相关概念|申万(一级|二级|三级)?行业?)[：:]/.test(normalized)
    || /^(技术|产品|业务|服务)$/.test(normalized)
    || /的产品$/.test(normalized);
}

function usefulMetric(label: string, value: string) {
  return isUsefulFact(value) ? `${label} ${value}` : "";
}

function isUsefulFact(value: string) {
  const normalized = value.trim();
  return normalized.length >= 2 && !/(待补|未知|暂无|未披露|资料不足|待核实|待跟踪)/.test(normalized);
}

function compactLabel(value: string) {
  const normalized = value.trim().replace(/^[：:、，,；;\s]+|[：:、，,；;\s]+$/g, "");
  return normalized.length > 18 ? `${normalized.slice(0, 17)}…` : normalized;
}

function normalizeFact(value: string) {
  return value.replace(/[\s，,。；;：:、（）()]/g, "").toLowerCase();
}

function dedupeFacts<T extends { label: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeFact(item.label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeStrings(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeFact(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
