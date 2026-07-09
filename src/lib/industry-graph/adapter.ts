import type { CategoryNode } from "@/lib/domain/types";
import type { IndustryGraphNode, IndustryGraphPayload, IndustryGraphRelationRow } from "./types";

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
): IndustryGraphPayload {
  const nodes: IndustryGraphNode[] = [];
  const edges: IndustryGraphPayload["edges"] = [];
  const companies = new Map<string, Extract<IndustryGraphNode, { kind: "company" }>>();

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

  for (const relation of relations) {
    const companyId = `company:${relation.stockCode}`;
    const existing = companies.get(relation.stockCode);

    if (existing) {
      existing.evidenceCount += relation.evidenceCount;
    } else {
      const company: Extract<IndustryGraphNode, { kind: "company" }> = {
        id: companyId,
        kind: "company",
        label: relation.shortName,
        stockCode: relation.stockCode,
        relationType: relation.relationType,
        confidence: relation.confidence,
        evidenceCount: relation.evidenceCount,
        layoutSeed: stableSeed(companyId),
      };

      companies.set(relation.stockCode, company);
      nodes.push(company);
    }

    const categoryId = `category:${relation.categoryId}`;

    edges.push({
      id: `${categoryId}->${companyId}`,
      source: categoryId,
      target: companyId,
      kind: "relation",
      relationType: relation.relationType,
      confidence: relation.confidence,
      evidenceCount: relation.evidenceCount,
    });
  }

  return {
    nodes,
    edges,
    stats: {
      categoryCount: nodes.filter((node) => node.kind === "category").length,
      companyCount: companies.size,
      evidenceCount: relations.reduce((sum, relation) => sum + relation.evidenceCount, 0),
    },
  };
}
