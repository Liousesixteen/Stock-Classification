import type { IndustryGraphEdge } from "./types";

type RelationEdge = Extract<IndustryGraphEdge, { kind: "relation" }>;

export function getRelationEndpoints(edge: RelationEdge) {
  const categoryNodeId = edge.source.startsWith("category:")
    ? edge.source
    : edge.target.startsWith("category:")
      ? edge.target
      : null;
  const companyNodeId = edge.source.startsWith("company:")
    ? edge.source
    : edge.target.startsWith("company:")
      ? edge.target
      : null;
  if (!categoryNodeId || !companyNodeId) return null;

  const categoryId = Number(categoryNodeId.slice("category:".length));
  if (!Number.isInteger(categoryId)) return null;
  return { categoryNodeId, categoryId, companyNodeId };
}
