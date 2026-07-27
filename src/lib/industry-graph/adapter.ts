import type { CategoryNode, ConfidenceLevel, RelationType } from "@/lib/domain/types";
import type { IndustryGraphEntityRelationRow, IndustryGraphNode, IndustryGraphPayload, IndustryGraphRelationRow } from "./types";

const RELATION_TYPE_PRIORITY: Record<RelationType, number> = {
  主营业务: 4,
  重要相关: 3,
  "概念/少量布局": 2,
  待验证: 1,
};

const CONFIDENCE_PRIORITY: Record<ConfidenceLevel, number> = {
  高: 3,
  中: 2,
  低: 1,
};

type CompanyNode = Extract<IndustryGraphNode, { kind: "company" }>;

function outranksCompanyMetadata(relation: IndustryGraphRelationRow, company: CompanyNode) {
  const relationTypeDifference =
    RELATION_TYPE_PRIORITY[relation.relationType] - RELATION_TYPE_PRIORITY[company.relationType];

  if (relationTypeDifference !== 0) {
    return relationTypeDifference > 0;
  }

  return CONFIDENCE_PRIORITY[relation.confidence] > CONFIDENCE_PRIORITY[company.confidence];
}

export function stableSeed(value: string) {
  let hash = 2166136261;

  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function buildIndustryGraph(
  categories: CategoryNode[],
  relations: IndustryGraphRelationRow[],
  entityRelations: IndustryGraphEntityRelationRow[] = [],
): IndustryGraphPayload {
  const nodes: IndustryGraphNode[] = [];
  const edges: IndustryGraphPayload["edges"] = [];
  const companies = new Map<string, CompanyNode>();
  const entities = new Map<number, Extract<IndustryGraphNode, { kind: "entity" }>>();
  const evidences = new Map<string, Extract<IndustryGraphNode, { kind: "evidence" }>>();
  const categoryNodeIds = new Set<string>();

  const visit = (category: CategoryNode) => {
    const categoryId = `category:${category.id}`;

    nodes.push({
      id: categoryId,
      kind: "category",
      label: category.name,
      categoryId: category.id,
      parentId: category.parentId,
      level: category.level,
      layoutSeed: stableSeed(categoryId),
    });
    categoryNodeIds.add(categoryId);

    if (category.parentId !== null) {
      const parentId = `category:${category.parentId}`;

      edges.push({
        id: `${parentId}->${categoryId}`,
        source: parentId,
        target: categoryId,
        kind: "hierarchy",
        evidenceCount: 0,
      });
    }

    category.children.forEach(visit);
  };

  categories.forEach(visit);

  const ensureCompany = (relation: {
    stockCode: string;
    shortName?: string;
    board?: string;
    industry?: string;
    intro?: string;
    mainBusiness?: string;
    confidence: ConfidenceLevel;
    evidenceCount: number;
    relationType?: RelationType;
  }) => {
    const companyId = `company:${relation.stockCode}`;
    const existing = companies.get(relation.stockCode);
    if (existing) return existing;
    const company: CompanyNode = {
      id: companyId,
      kind: "company",
      label: relation.shortName || relation.stockCode,
      stockCode: relation.stockCode,
      ...(relation.board ? { board: relation.board } : {}),
      ...(relation.industry ? { industry: relation.industry } : {}),
      ...(relation.intro ? { summary: relation.intro } : {}),
      ...(relation.mainBusiness ? { mainBusiness: relation.mainBusiness } : {}),
      relationType: relation.relationType ?? "待验证",
      confidence: relation.confidence,
      evidenceCount: relation.evidenceCount,
      layoutSeed: stableSeed(companyId),
    };
    companies.set(relation.stockCode, company);
    nodes.push(company);
    return company;
  };

  const addEvidenceNodes = (
    scope: "category" | "entity",
    ownerNodeId: string,
    relationId: number | undefined,
    previews: IndustryGraphRelationRow["evidencePreviews"],
  ) => {
    for (const preview of previews ?? []) {
      const evidenceNodeId = `evidence:${scope}:${preview.id}`;
      if (!evidences.has(evidenceNodeId)) {
        const evidenceNode: Extract<IndustryGraphNode, { kind: "evidence" }> = {
          id: evidenceNodeId,
          kind: "evidence",
          label: preview.title,
          evidenceId: preview.id,
          evidenceScope: scope,
          ownerNodeId,
          relationId,
          sourceType: preview.sourceType,
          sourceDate: preview.sourceDate,
          credibility: preview.credibility,
          url: preview.url ?? "",
          excerpt: preview.excerpt ?? "",
          verificationStatus: preview.verificationStatus ?? "unverified",
          layoutSeed: stableSeed(evidenceNodeId),
        };
        evidences.set(evidenceNodeId, evidenceNode);
        nodes.push(evidenceNode);
      }
      edges.push({
        id: `${ownerNodeId}->${evidenceNodeId}`,
        source: ownerNodeId,
        target: evidenceNodeId,
        kind: "evidenceLink",
        relationId,
        confidence: preview.credibility,
        evidenceCount: 1,
        direction: "outbound",
        strength: preview.credibility === "高" ? 90 : preview.credibility === "中" ? 68 : 42,
        observedAt: preview.sourceDate,
      });
    }
  };

  for (const relation of relations) {
    const companyId = `company:${relation.stockCode}`;
    const categoryId = `category:${relation.categoryId}`;
    if (!categoryNodeIds.has(categoryId)) continue;
    const existing = companies.get(relation.stockCode);

    if (existing) {
      existing.evidenceCount += relation.evidenceCount;

      if (outranksCompanyMetadata(relation, existing)) {
        existing.relationType = relation.relationType;
        existing.confidence = relation.confidence;
      }
    } else {
      ensureCompany({
        stockCode: relation.stockCode,
        shortName: relation.shortName,
        board: relation.board,
        industry: relation.industry,
        intro: relation.intro,
        mainBusiness: relation.mainBusiness,
        confidence: relation.confidence,
        evidenceCount: relation.evidenceCount,
        relationType: relation.relationType,
      });
    }

    edges.push({
      id: `${categoryId}->${companyId}`,
      source: categoryId,
      target: companyId,
      kind: "relation",
      relationId: relation.relationId,
      relationType: relation.relationType,
      confidence: relation.confidence,
      evidenceCount: relation.evidenceCount,
      rationale: relation.rationale ?? "",
      isWatchlist: relation.isWatchlist ?? false,
      evidencePreviews: relation.evidencePreviews ?? [],
      direction: relation.direction ?? "undirected",
      strength: relation.strength ?? 50,
      observedAt: relation.observedAt ?? "",
      verificationStatus: relation.verificationStatus ?? "unverified",
    });
    addEvidenceNodes("category", companyId, relation.relationId, relation.evidencePreviews);
  }

  for (const relation of entityRelations) {
    const companyId = `company:${relation.stockCode}`;
    const entityId = `entity:${relation.entityId}`;
    const existingCompany = companies.get(relation.stockCode);
    if (existingCompany) {
      existingCompany.evidenceCount += relation.evidenceCount;
    } else {
      ensureCompany({
        stockCode: relation.stockCode,
        shortName: relation.shortName,
        board: relation.board,
        industry: relation.industry,
        intro: relation.intro,
        mainBusiness: relation.mainBusiness,
        confidence: relation.confidence,
        evidenceCount: relation.evidenceCount,
      });
    }
    if (!entities.has(relation.entityId)) {
      const entity: Extract<IndustryGraphNode, { kind: "entity" }> = {
        id: entityId,
        kind: "entity",
        label: relation.entityName,
        entityId: relation.entityId,
        entityType: relation.entityType,
        summary: relation.entitySummary,
        evidenceCount: relation.evidenceCount,
        layoutSeed: stableSeed(entityId),
      };
      entities.set(relation.entityId, entity);
      nodes.push(entity);
    } else {
      entities.get(relation.entityId)!.evidenceCount += relation.evidenceCount;
    }
    edges.push({
      id: `${companyId}->${entityId}:${relation.relationId}`,
      source: companyId,
      target: entityId,
      kind: "entityRelation",
      relationId: relation.relationId,
      relationType: relation.relationType,
      confidence: relation.confidence,
      evidenceCount: relation.evidenceCount,
      rationale: relation.rationale,
      isWatchlist: relation.isWatchlist,
      evidencePreviews: relation.evidencePreviews,
      direction: relation.direction ?? "undirected",
      strength: relation.strength ?? 50,
      observedAt: relation.observedAt ?? "",
      verificationStatus: relation.verificationStatus ?? "unverified",
    });
    addEvidenceNodes("entity", entityId, relation.relationId, relation.evidencePreviews);
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const validEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const relationEdges = validEdges.filter((edge) => edge.kind === "relation" || edge.kind === "entityRelation");

  return {
    nodes,
    edges: validEdges,
    stats: {
      categoryCount: nodes.filter((node) => node.kind === "category").length,
      companyCount: companies.size,
      evidenceCount: relations.reduce((sum, relation) => sum + relation.evidenceCount, 0) + entityRelations.reduce((sum, relation) => sum + relation.evidenceCount, 0),
      verifiedRelationCount: relationEdges.filter((edge) => edge.verificationStatus === "verified").length,
      unverifiedRelationCount: relationEdges.filter((edge) => edge.verificationStatus !== "verified").length,
      watchlistCount: relationEdges.filter((edge) => edge.isWatchlist).length,
      entityCount: entities.size,
      evidenceNodeCount: evidences.size,
    },
  };
}
