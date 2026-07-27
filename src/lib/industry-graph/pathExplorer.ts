import type { IndustryGraphEdge, IndustryGraphNode, IndustryGraphPayload } from "./types";

export type PathVerification = "多源验证" | "单源待核" | "缺证据" | "待验证";

export type ResearchPath = {
  id: string;
  nodeIds: string[];
  edgeIds: string[];
  nodes: Array<{ id: string; label: string; kind: IndustryGraphNode["kind"] }>;
  evidenceCount: number;
  independentSourceCount: number;
  verification: PathVerification;
  nextAction: string;
  score: number;
};

type Walk = { nodeIds: string[]; edges: IndustryGraphEdge[] };

export function findResearchPaths(graph: IndustryGraphPayload, startNodeId: string, maxDepth = 3, maxResults = 12): ResearchPath[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!nodeById.has(startNodeId)) return [];
  const adjacency = new Map<string, Array<{ nodeId: string; edge: IndustryGraphEdge }>>();
  for (const edge of graph.edges) {
    appendAdjacent(adjacency, edge.source, { nodeId: edge.target, edge });
    appendAdjacent(adjacency, edge.target, { nodeId: edge.source, edge });
  }
  const queue: Walk[] = [{ nodeIds: [startNodeId], edges: [] }];
  const paths: ResearchPath[] = [];

  while (queue.length > 0 && paths.length < maxResults * 8) {
    const walk = queue.shift()!;
    const currentId = walk.nodeIds.at(-1)!;
    const depth = walk.edges.length;
    const current = nodeById.get(currentId);
    if (depth > 0 && current && current.kind !== "category") paths.push(describePath(walk, nodeById));
    if (depth >= maxDepth) continue;
    const nextSteps = (adjacency.get(currentId) ?? []).sort((left, right) => edgeWeight(right.edge) - edgeWeight(left.edge));
    for (const step of nextSteps) {
      if (walk.nodeIds.includes(step.nodeId)) continue;
      queue.push({ nodeIds: [...walk.nodeIds, step.nodeId], edges: [...walk.edges, step.edge] });
    }
  }

  return dedupePaths(paths)
    .sort((left, right) => right.score - left.score || right.evidenceCount - left.evidenceCount || left.id.localeCompare(right.id))
    .slice(0, maxResults);
}

function appendAdjacent(map: Map<string, Array<{ nodeId: string; edge: IndustryGraphEdge }>>, key: string, value: { nodeId: string; edge: IndustryGraphEdge }) {
  const items = map.get(key) ?? [];
  items.push(value);
  map.set(key, items);
}

function describePath(walk: Walk, nodeById: Map<string, IndustryGraphNode>): ResearchPath {
  const relationships = walk.edges.filter((edge): edge is Exclude<IndustryGraphEdge, Extract<IndustryGraphEdge, { kind: "hierarchy" }>> => edge.kind !== "hierarchy");
  const evidenceCount = relationships.reduce((sum, edge) => sum + edge.evidenceCount, 0);
  const sourceTypes = new Set(relationships.flatMap((edge) => edge.kind === "evidenceLink" ? [] : edge.evidencePreviews?.map((evidence) => evidence.sourceType) ?? []));
  const hasMissingEvidence = relationships.some((edge) => edge.evidenceCount === 0);
  const needsReview = relationships.some((edge) => edge.confidence === "低" || (edge.kind === "relation" && edge.relationType === "待验证"));
  const verification: PathVerification = hasMissingEvidence ? "缺证据" : needsReview ? "待验证" : sourceTypes.size >= 2 ? "多源验证" : "单源待核";
  const score = relationships.reduce((sum, edge) => sum + edgeWeight(edge), 0) + (verification === "多源验证" ? 8 : verification === "单源待核" ? 2 : verification === "待验证" ? -2 : -5) - Math.max(0, walk.edges.length - 1);
  return {
    id: walk.nodeIds.join("->"),
    nodeIds: walk.nodeIds,
    edgeIds: walk.edges.map((edge) => edge.id),
    nodes: walk.nodeIds.map((id) => {
      const node = nodeById.get(id)!;
      return { id, label: node.label, kind: node.kind };
    }),
    evidenceCount,
    independentSourceCount: sourceTypes.size,
    verification,
    nextAction: nextAction(verification, relationships),
    score,
  };
}

function edgeWeight(edge: IndustryGraphEdge) {
  if (edge.kind === "hierarchy") return 0.5;
  const confidence = edge.confidence === "高" ? 4 : edge.confidence === "中" ? 2 : 0;
  const evidence = Math.min(edge.evidenceCount, 3) * 2;
  const relation = edge.kind === "evidenceLink"
    ? 2
    : edge.relationType === "主营业务" || edge.relationType === "核心产品"
      ? 3
      : edge.relationType === "待验证" || edge.relationType === "风险传导"
        ? 0
        : 1;
  return confidence + evidence + relation + (edge.kind !== "evidenceLink" && edge.isWatchlist ? 1 : 0);
}

function nextAction(verification: PathVerification, relationships: Array<Exclude<IndustryGraphEdge, Extract<IndustryGraphEdge, { kind: "hierarchy" }>>>) {
  const keyRelation = relationships.at(-1);
  const relationLabel = keyRelation?.kind === "evidenceLink" ? "证据支持" : keyRelation?.relationType ?? "当前关系";
  if (verification === "缺证据") return `优先为「${relationLabel}」补充公告、年报或研报证据。`;
  if (verification === "待验证") return `复核「${relationLabel}」的低确信度判断，并寻找独立来源。`;
  if (verification === "单源待核") return "已有单一来源支持，建议补充第二类独立来源交叉验证。";
  return "路径已有多源支持，可继续评估订单、产能、价格或业绩传导。";
}

function dedupePaths(paths: ResearchPath[]) {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const endpoint = path.nodeIds.at(-1)!;
    const key = `${path.nodeIds[0]}->${endpoint}:${path.verification}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
