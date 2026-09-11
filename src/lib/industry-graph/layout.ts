import type { IndustryGraphPayload } from "./types";
import { getRelationEndpoints } from "./relations";

export type GraphPosition = [number, number, number];

export type GraphQuality = {
  tier: "full" | "balanced" | "reduced";
  particlesPerEdge: number;
  maxLabels: number;
  pixelRatio: number;
};

export type FocusedGraphNeighborhood = {
  categoryIds: Set<number>;
  contextCategoryIds: Set<number>;
  companyNodeIds: Set<string>;
  entityNodeIds: Set<string>;
  evidenceNodeIds: Set<string>;
  visibleNodeIds: Set<string>;
  visibleEdgeIds: Set<string>;
};

export type CompanyFocusedGraphNeighborhood = {
  focusCompanyNodeId: string;
  categoryIds: Set<number>;
  contextCategoryIds: Set<number>;
  peerCompanyNodeIds: Set<string>;
  entityNodeIds: Set<string>;
  evidenceNodeIds: Set<string>;
  visibleNodeIds: Set<string>;
  visibleEdgeIds: Set<string>;
};

export type CompanyGraphBranch = "upstream" | "core" | "downstream" | "organization" | "peer";

export type OverviewGraphNeighborhood = {
  visibleNodeIds: Set<string>;
  visibleEdgeIds: Set<string>;
  representativeCompanyNodeIds: Set<string>;
};

export function getOverviewGraphNeighborhood(graph: IndustryGraphPayload, maxCompaniesPerRoot = 8): OverviewGraphNeighborhood {
  const categories = graph.nodes.filter((node) => node.kind === "category");
  const categoryByNodeId = new Map(categories.map((node) => [node.id, node]));
  const rootNodeIds = new Set(categories.filter((node) => node.parentId === null).map((node) => node.id));
  const visibleNodeIds = new Set(categories.filter((node) => node.level <= 2).map((node) => node.id));
  const representativeCompanyNodeIds = new Set<string>();

  rootNodeIds.forEach((rootNodeId) => {
    graph.edges
      .flatMap((edge) => {
        if (edge.kind !== "relation") return [];
        const endpoints = getRelationEndpoints(edge);
        if (!endpoints || endpoints.categoryNodeId !== rootNodeId) return [];
        return [{ edge, companyNodeId: endpoints.companyNodeId }];
      })
      .sort((left, right) => confidenceRank(right.edge.confidence) - confidenceRank(left.edge.confidence)
        || right.edge.evidenceCount - left.edge.evidenceCount
        || left.companyNodeId.localeCompare(right.companyNodeId))
      .slice(0, maxCompaniesPerRoot)
      .forEach(({ companyNodeId }) => {
        representativeCompanyNodeIds.add(companyNodeId);
        visibleNodeIds.add(companyNodeId);
      });
  });

  const visibleEdgeIds = new Set(graph.edges.flatMap((edge) => {
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return [];
    if (edge.kind === "hierarchy") {
      return categoryByNodeId.has(edge.source) && categoryByNodeId.has(edge.target) ? [edge.id] : [];
    }
    if (edge.kind === "relation") {
      const endpoints = getRelationEndpoints(edge);
      return endpoints && representativeCompanyNodeIds.has(endpoints.companyNodeId) ? [edge.id] : [];
    }
    return [];
  }));

  return { visibleNodeIds, visibleEdgeIds, representativeCompanyNodeIds };
}

export function getCompanyFocusedGraphNeighborhood(graph: IndustryGraphPayload, stockCode: string, expandedBranch: CompanyGraphBranch | null = null): CompanyFocusedGraphNeighborhood {
  const focusCompanyNodeId = `company:${stockCode}`;
  const categoryIds = new Set<number>();
  const categoryNodeIds = new Set<string>();
  graph.edges.forEach((edge) => {
    if (edge.kind !== "relation") return;
    const endpoints = getRelationEndpoints(edge);
    if (!endpoints || endpoints.companyNodeId !== focusCompanyNodeId) return;
    categoryIds.add(endpoints.categoryId);
    categoryNodeIds.add(endpoints.categoryNodeId);
  });
  const categories = graph.nodes.filter((node): node is Extract<(typeof graph.nodes)[number], { kind: "category" }> => node.kind === "category");
  const categoryById = new Map(categories.map((node) => [node.categoryId, node]));
  const contextCategoryIds = new Set<number>();
  categoryIds.forEach((categoryId) => {
    let parentId = categoryById.get(categoryId)?.parentId ?? null;
    while (parentId !== null) {
      contextCategoryIds.add(parentId);
      parentId = categoryById.get(parentId)?.parentId ?? null;
    }
  });
  const contextCategoryNodeIds = [...contextCategoryIds].map((categoryId) => `category:${categoryId}`);

  const peerCompanyNodeIds = new Set<string>();
  [...categoryNodeIds].sort().forEach((categoryNodeId) => {
    const peers = graph.edges.flatMap((edge) => {
      if (edge.kind !== "relation") return [];
      const endpoints = getRelationEndpoints(edge);
      if (!endpoints || endpoints.categoryNodeId !== categoryNodeId || endpoints.companyNodeId === focusCompanyNodeId) return [];
      const company = graph.nodes.find((node) => node.id === endpoints.companyNodeId && node.kind === "company");
      return company ? [{ nodeId: endpoints.companyNodeId, evidenceCount: edge.evidenceCount, confidence: edge.confidence }] : [];
    });
    peers
      .sort((left, right) => confidenceRank(right.confidence) - confidenceRank(left.confidence) || right.evidenceCount - left.evidenceCount || left.nodeId.localeCompare(right.nodeId))
      .slice(0, 4)
      .forEach((peer) => peerCompanyNodeIds.add(peer.nodeId));
  });
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const rankedEntityRows = graph.edges
    .filter((edge): edge is Extract<(typeof graph.edges)[number], { kind: "entityRelation" }> => edge.kind === "entityRelation" && edge.source === focusCompanyNodeId)
    .sort((left, right) => (right.strength ?? 0) - (left.strength ?? 0) || right.evidenceCount - left.evidenceCount || left.target.localeCompare(right.target));
  const hasStructuredProfile = rankedEntityRows.some((edge) => {
    const node = nodesById.get(edge.target);
    return node?.kind === "entity" && node.profileRole === "hub";
  });
  const directEntityRows = hasStructuredProfile
    ? rankedEntityRows.filter((edge) => {
      const node = nodesById.get(edge.target);
      return node?.kind === "entity" && node.profileRole === "hub" && (expandedBranch === null || companyEntityBranch(node, edge) === expandedBranch);
    })
    : expandedBranch !== null
    ? rankedEntityRows
      .filter((edge) => companyEntityBranch(nodesById.get(edge.target), edge) === expandedBranch)
      .slice(0, 7)
    : boundedDefaultCompanyEntities(rankedEntityRows, nodesById);
  const entityNodeIds = new Set(directEntityRows.map((edge) => edge.target));
  if (hasStructuredProfile) {
    directEntityRows.forEach((hubEdge) => {
      graph.edges
        .filter((edge): edge is Extract<(typeof graph.edges)[number], { kind: "entityRelation" }> => edge.kind === "entityRelation" && edge.source === hubEdge.target)
        .sort((left, right) => (right.strength ?? 0) - (left.strength ?? 0) || left.target.localeCompare(right.target))
        .slice(0, expandedBranch === null ? 2 : 7)
        .forEach((edge) => entityNodeIds.add(edge.target));
    });
  }
  // 证据详情仅在检查器中按需查看，不在三维场景里默认铺开。
  const evidenceNodeIds = new Set<string>();
  const visibleNodeIds = new Set<string>([
    focusCompanyNodeId,
    ...categoryNodeIds,
    ...contextCategoryNodeIds,
    ...peerCompanyNodeIds,
    ...entityNodeIds,
    ...evidenceNodeIds,
  ]);
  const visibleEdgeIds = new Set(graph.edges.flatMap((edge) => {
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return [];
    if (edge.kind === "hierarchy") return [edge.id];
    return [edge.id];
  }));

  return { focusCompanyNodeId, categoryIds, contextCategoryIds, peerCompanyNodeIds, entityNodeIds, evidenceNodeIds, visibleNodeIds, visibleEdgeIds };
}

function boundedDefaultCompanyEntities(
  rows: Array<Extract<IndustryGraphPayload["edges"][number], { kind: "entityRelation" }>>,
  nodesById: Map<string, IndustryGraphPayload["nodes"][number]>,
) {
  const limits: Record<CompanyGraphBranch, number> = {
    upstream: 2,
    core: 4,
    downstream: 3,
    organization: 1,
    peer: 1,
  };
  const counts: Record<CompanyGraphBranch, number> = { upstream: 0, core: 0, downstream: 0, organization: 0, peer: 0 };
  return rows.filter((edge) => {
    const branch = companyEntityBranch(nodesById.get(edge.target), edge);
    if (counts[branch] >= limits[branch]) return false;
    counts[branch] += 1;
    return true;
  });
}

export function getFocusedGraphNeighborhood(graph: IndustryGraphPayload, focusCategoryId: number): FocusedGraphNeighborhood {
  const categories = graph.nodes.filter((node) => node.kind === "category");
  const categoryById = new Map(categories.map((node) => [node.categoryId, node]));
  const childIds = new Map<number, number[]>();
  categories.forEach((category) => {
    if (category.parentId === null) return;
    const rows = childIds.get(category.parentId) ?? [];
    rows.push(category.categoryId);
    childIds.set(category.parentId, rows);
  });

  // Progressive disclosure keeps a complete taxonomy readable at A-share scale:
  // each click opens exactly one classification tier. Companies appear only when
  // the focused category is a leaf (or when they are directly assigned to it).
  const directChildCategoryIds = new Set(childIds.get(focusCategoryId) ?? []);
  const categoryIds = new Set<number>([focusCategoryId, ...directChildCategoryIds]);

  const companyNodeIds = new Set(graph.edges.flatMap((edge) => {
    if (edge.kind !== "relation") return [];
    const endpoints = getRelationEndpoints(edge);
    return endpoints && endpoints.categoryId === focusCategoryId ? [endpoints.companyNodeId] : [];
  }));
  const contextCategoryIds = new Set<number>();
  const focus = categoryById.get(focusCategoryId);
  if (focus?.parentId !== null && focus?.parentId !== undefined) contextCategoryIds.add(focus.parentId);
  graph.edges.forEach((edge) => {
    if (edge.kind !== "relation") return;
    const endpoints = getRelationEndpoints(edge);
    if (!endpoints || !companyNodeIds.has(endpoints.companyNodeId)) return;
    if (!categoryIds.has(endpoints.categoryId)) contextCategoryIds.add(endpoints.categoryId);
  });

  // 产业层只表达“分类—公司”关系；公司内部知识节点在进入公司星图后再按需展开。
  const entityNodeIds = new Set<string>();
  const evidenceNodeIds = new Set<string>();
  // The local orbit is intentionally scoped to the focused branch. Companies
  // can still expose their cross-chain relations in the inspector/path view,
  // but rendering those context categories here creates long rays whose other
  // endpoint is outside the focused camera volume.
  const visibleNodeIds = new Set<string>([
    ...[...categoryIds].map((id) => `category:${id}`),
    ...companyNodeIds,
    ...entityNodeIds,
    ...evidenceNodeIds,
  ]);
  const visibleEdgeIds = new Set(graph.edges.flatMap((edge) => {
    if (edge.kind === "hierarchy") {
      return visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target) ? [edge.id] : [];
    }
    if (edge.kind === "relation") {
      const endpoints = getRelationEndpoints(edge);
      return endpoints
        && endpoints.categoryId === focusCategoryId
        && companyNodeIds.has(endpoints.companyNodeId)
        ? [edge.id]
        : [];
    }
    if (edge.kind === "entityRelation") {
      return companyNodeIds.has(edge.source) && entityNodeIds.has(edge.target) ? [edge.id] : [];
    }
    return evidenceNodeIds.has(edge.target) && visibleNodeIds.has(edge.source) ? [edge.id] : [];
  }));

  return { categoryIds, contextCategoryIds, companyNodeIds, entityNodeIds, evidenceNodeIds, visibleNodeIds, visibleEdgeIds };
}

function seededUnit(seed: number) {
  return ((Math.imul(seed ^ (seed >>> 16), 2246822519) >>> 0) % 10_000) / 10_000;
}

function offset(seed: number, radius: number, verticalSpread: number): GraphPosition {
  const angle = seededUnit(seed) * Math.PI * 2;
  return [
    Math.cos(angle) * radius,
    (seededUnit(seed + 1) - 0.5) * verticalSpread,
    Math.sin(angle) * radius,
  ];
}

function add(left: GraphPosition, right: GraphPosition): GraphPosition {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

export function createGraphLayout(graph: IndustryGraphPayload): Record<string, GraphPosition> {
  const positions: Record<string, GraphPosition> = {};
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const roots = graph.nodes.filter((node) => node.kind === "category" && node.parentId === null);

  roots.forEach((root, index) => {
    if (index === 0) {
      positions[root.id] = [0, 0, 0];
      return;
    }
    positions[root.id] = orbitalShellPoint([0, 0, 0], 42, index - 1, Math.max(roots.length - 1, 1), root.layoutSeed);
  });

  const hierarchyEdges = graph.edges.filter((edge) => edge.kind === "hierarchy");
  const childrenByParent = new Map<string, string[]>();
  hierarchyEdges.forEach((edge) => {
    const rows = childrenByParent.get(edge.source) ?? [];
    rows.push(edge.target);
    childrenByParent.set(edge.source, rows);
  });
  childrenByParent.forEach((rows) => rows.sort());
  for (let depth = 1; depth <= 16; depth += 1) {
    for (const edge of hierarchyEdges) {
      const node = nodesById.get(edge.target);
      const parent = positions[edge.source];
      if (!node || node.kind !== "category" || node.level !== depth || !parent) continue;
      const siblings = childrenByParent.get(edge.source) ?? [edge.target];
      const siblingIndex = Math.max(0, siblings.indexOf(edge.target));
      const radius = Math.max(3.8, 8.6 - depth * 0.55) + Math.min(13, Math.sqrt(siblings.length) * 2.15);
      positions[node.id] = orbitalShellPoint(parent, radius, siblingIndex, siblings.length, node.layoutSeed);
    }
  }

  const relationEdges = graph.edges
    .filter((edge) => edge.kind === "relation")
    .sort((left, right) => {
      const leftEndpoints = getRelationEndpoints(left);
      const rightEndpoints = getRelationEndpoints(right);
      const leftLevel = leftEndpoints ? nodesById.get(leftEndpoints.categoryNodeId)?.kind === "category" ? (nodesById.get(leftEndpoints.categoryNodeId) as Extract<(typeof graph.nodes)[number], { kind: "category" }>).level : 99 : 99;
      const rightLevel = rightEndpoints ? nodesById.get(rightEndpoints.categoryNodeId)?.kind === "category" ? (nodesById.get(rightEndpoints.categoryNodeId) as Extract<(typeof graph.nodes)[number], { kind: "category" }>).level : 99 : 99;
      return leftLevel - rightLevel || left.id.localeCompare(right.id);
    });
  relationEdges.forEach((edge, index) => {
    const endpoints = getRelationEndpoints(edge);
    if (!endpoints || positions[endpoints.companyNodeId]) return;
    const node = nodesById.get(endpoints.companyNodeId);
    const parent = positions[endpoints.categoryNodeId];
    if (!node || node.kind !== "company" || !parent) return;
    positions[node.id] = add(parent, offset(node.layoutSeed + index, 3.4, 3));
  });

  graph.edges.filter((edge) => edge.kind === "entityRelation").forEach((edge, index) => {
    if (positions[edge.target]) return;
    const node = nodesById.get(edge.target);
    const parent = positions[edge.source];
    if (!node || node.kind !== "entity" || !parent) return;
    positions[node.id] = add(parent, offset(node.layoutSeed + index, 2.3, 2.1));
  });

  graph.edges.filter((edge) => edge.kind === "evidenceLink").forEach((edge, index) => {
    if (positions[edge.target]) return;
    const node = nodesById.get(edge.target);
    const parent = positions[edge.source];
    if (!node || node.kind !== "evidence" || !parent) return;
    positions[node.id] = add(parent, offset(node.layoutSeed + index, 1.45, 1.2));
  });

  graph.nodes.forEach((node, index) => {
    if (!positions[node.id]) {
      positions[node.id] = add([index * 1.5, 0, 0], offset(node.layoutSeed, 5, 6));
    }
  });

  return positions;
}

export function createFocusedGraphLayout(graph: IndustryGraphPayload, focusCategoryId: number): Record<string, GraphPosition> {
  const positions: Record<string, GraphPosition> = {};
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const categories = graph.nodes.filter((node) => node.kind === "category");
  const categoryById = new Map(categories.map((node) => [node.categoryId, node]));
  const focus = categoryById.get(focusCategoryId);
  if (!focus) return createGraphLayout(graph);
  const neighborhood = getFocusedGraphNeighborhood(graph, focusCategoryId);

  const childIds = new Map<number, number[]>();
  categories.forEach((category) => {
    if (category.parentId === null) return;
    const rows = childIds.get(category.parentId) ?? [];
    rows.push(category.categoryId);
    childIds.set(category.parentId, rows);
  });
  childIds.forEach((rows) => rows.sort((left, right) => left - right));

  const descendants = neighborhood.categoryIds;

  positions[focus.id] = [0, 0, 0];
  const directChildren = (childIds.get(focusCategoryId) ?? []).map((id) => categoryById.get(id)).filter(Boolean) as typeof categories;
  directChildren.forEach((category, index) => {
    positions[category.id] = orbitalShellPoint(
      [0, 0, 0],
      7.6 + seededUnit(category.layoutSeed + 37) * 1.8,
      index,
      directChildren.length,
      category.layoutSeed,
    );
  });

  const descendantRows = categories
    .filter((category) => descendants.has(category.categoryId) && category.categoryId !== focusCategoryId && category.parentId !== focusCategoryId)
    .sort((left, right) => left.level - right.level || left.categoryId - right.categoryId);
  descendantRows.forEach((category) => {
    const parent = category.parentId === null ? undefined : categoryById.get(category.parentId);
    const parentPosition = parent ? positions[parent.id] : undefined;
    if (!parentPosition) return;
    const siblings = childIds.get(category.parentId!) ?? [];
    const siblingIndex = siblings.indexOf(category.categoryId);
    const spread = Math.min(Math.PI * 0.74, 0.52 + siblings.length * 0.12);
    const baseAngle = Math.atan2(parentPosition[1], parentPosition[0]);
    const angle = baseAngle - spread / 2 + ((siblingIndex + 1) / (siblings.length + 1)) * spread;
    const radius = 3.2 + Math.min(category.level - focus.level, 4) * 0.38;
    positions[category.id] = orbitPoint(parentPosition, radius, angle, 0.74 + seededUnit(category.layoutSeed + 7) * 0.5, seededUnit(category.layoutSeed + 11) * 1.2 - 0.6);
  });

  const relationEdges = graph.edges.flatMap((edge) => {
    if (edge.kind !== "relation") return [];
    const endpoints = getRelationEndpoints(edge);
    return endpoints && neighborhood.companyNodeIds.has(endpoints.companyNodeId) && endpoints.categoryId === focusCategoryId
      ? [{ edge, endpoints }]
      : [];
  });
  const relationGroups = new Map<string, typeof relationEdges>();
  relationEdges.forEach((row) => {
    const rows = relationGroups.get(row.endpoints.categoryNodeId) ?? [];
    rows.push(row);
    relationGroups.set(row.endpoints.categoryNodeId, rows);
  });
  relationGroups.forEach((edges, categoryNodeId) => {
    const anchor = positions[categoryNodeId];
    if (!anchor) return;
    edges
      .slice()
      .sort((left, right) => left.endpoints.companyNodeId.localeCompare(right.endpoints.companyNodeId))
      .forEach(({ endpoints }, index) => {
        if (positions[endpoints.companyNodeId]) return;
        const node = nodesById.get(endpoints.companyNodeId);
        if (!node || node.kind !== "company") return;
        const isFocusAnchor = categoryNodeId === focus.id;
        if (isFocusAnchor) {
          positions[node.id] = orbitalShellPoint(
            anchor,
            6 + seededUnit(node.layoutSeed + 41) * 1.8,
            index,
            edges.length,
            node.layoutSeed,
          );
          return;
        }
        const radius = 2.8 + Math.min(edges.length, 8) * 0.1;
        const baseAngle = isFocusAnchor ? -Math.PI / 2 : Math.atan2(anchor[1], anchor[0]);
        const span = isFocusAnchor ? Math.PI * 2 : Math.min(Math.PI * 1.35, 0.8 + edges.length * 0.18);
        const angle = baseAngle - span / 2 + ((index + 1) / (edges.length + 1)) * span;
        const tilt = isFocusAnchor ? 0.92 + (index % 3) * 0.16 : 0.72 + seededUnit(node.layoutSeed + 5) * 0.7;
        const roll = seededUnit(node.layoutSeed + 19) * 1.4 - 0.7;
        positions[node.id] = orbitPoint(anchor, radius, angle, tilt, roll);
      });
  });

  graph.edges.filter((edge) => edge.kind === "entityRelation").forEach((edge, index) => {
    const source = positions[edge.source];
    const node = nodesById.get(edge.target);
    if (!source || !node || node.kind !== "entity" || positions[node.id]) return;
    const angle = seededUnit(node.layoutSeed + index) * Math.PI * 2;
    positions[node.id] = orbitPoint(source, 1.9, angle, 1.08, seededUnit(node.layoutSeed + 29) - 0.5);
  });

  graph.edges.filter((edge) => edge.kind === "evidenceLink").forEach((edge, index) => {
    const source = positions[edge.source];
    const node = nodesById.get(edge.target);
    if (!source || !node || node.kind !== "evidence" || positions[node.id]) return;
    const angle = seededUnit(node.layoutSeed + index) * Math.PI * 2;
    positions[node.id] = orbitPoint(source, 1.15, angle, 1.16, seededUnit(node.layoutSeed + 47) - 0.5);
  });

  graph.nodes.forEach((node, index) => {
    if (positions[node.id]) return;
    const angle = seededUnit(node.layoutSeed + index) * Math.PI * 2;
    const radius = 54 + seededUnit(node.layoutSeed + 9) * 12;
    positions[node.id] = [Math.cos(angle) * radius, Math.sin(angle) * radius, -20 - seededUnit(node.layoutSeed + 7) * 12];
  });

  // Keep the complete focused branch in one camera volume without flattening
  // it onto a single shell. Only extreme deep descendants are gently bounded.
  const focusedViewportRadius = 11.8;
  neighborhood.visibleNodeIds.forEach((nodeId) => {
    if (nodeId === focus.id) return;
    const position = positions[nodeId];
    if (!position) return;
    const distance = Math.hypot(...position);
    if (distance <= focusedViewportRadius) return;
    const scale = focusedViewportRadius / distance;
    positions[nodeId] = [position[0] * scale, position[1] * scale, position[2] * scale];
  });

  return positions;
}

export function createCompanyFocusedGraphLayout(graph: IndustryGraphPayload, stockCode: string, expandedBranch: CompanyGraphBranch | null = null): Record<string, GraphPosition> {
  const positions: Record<string, GraphPosition> = {};
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const neighborhood = getCompanyFocusedGraphNeighborhood(graph, stockCode, expandedBranch);
  const focus = nodesById.get(neighborhood.focusCompanyNodeId);
  if (!focus || focus.kind !== "company") return createGraphLayout(graph);
  positions[focus.id] = [0, 0, 0];

  const relationByEntity = new Map(graph.edges
    .filter((edge): edge is Extract<(typeof graph.edges)[number], { kind: "entityRelation" }> => edge.kind === "entityRelation" && edge.source === focus.id)
    .map((edge) => [edge.target, edge]));
  const groupFor = (nodeId: string) => {
    const edge = relationByEntity.get(nodeId);
    const node = nodesById.get(nodeId);
    return companyEntityBranch(node, edge);
  };
  const anchors: Record<ReturnType<typeof groupFor>, GraphPosition> = {
    upstream: [-8.8, 3.8, -1.6],
    core: [-4.9, -6.9, 1.9],
    downstream: [6.4, -6.2, -1.3],
    peer: [9.0, 3.7, 2.0],
    organization: [0, 8.2, 1.8],
  };
  const grouped = new Map<keyof typeof anchors, string[]>();
  neighborhood.entityNodeIds.forEach((nodeId) => {
    if (!relationByEntity.has(nodeId)) return;
    const group = groupFor(nodeId);
    const rows = grouped.get(group) ?? [];
    rows.push(nodeId);
    grouped.set(group, rows);
  });
  grouped.forEach((nodeIds, group) => {
    const anchor = anchors[group];
    nodeIds.sort().forEach((nodeId, index) => {
      const node = nodesById.get(nodeId);
      if (!node) return;
      positions[nodeId] = orbitalShellPoint(anchor, 2.45 + seededUnit(node.layoutSeed + 17) * .9, index, nodeIds.length, node.layoutSeed);
    });
  });

  // Structured company profiles use a small number of semantic hubs. Real
  // suppliers, customers and competitors orbit their parent hub instead of
  // becoming disconnected facts around the company.
  graph.edges
    .filter((edge): edge is Extract<(typeof graph.edges)[number], { kind: "entityRelation" }> => edge.kind === "entityRelation" && neighborhood.entityNodeIds.has(edge.source) && neighborhood.entityNodeIds.has(edge.target))
    .reduce((groups, edge) => {
      const rows = groups.get(edge.source) ?? [];
      rows.push(edge.target);
      groups.set(edge.source, rows);
      return groups;
    }, new Map<string, string[]>())
    .forEach((childIds, hubId) => {
      const anchor = positions[hubId];
      if (!anchor) return;
      childIds.sort().forEach((nodeId, index) => {
        const node = nodesById.get(nodeId);
        if (!node) return;
        positions[nodeId] = orbitalShellPoint(anchor, 2.65 + seededUnit(node.layoutSeed + 41) * .55, index, childIds.length, node.layoutSeed);
      });
    });

  const categories = graph.nodes
    .filter((node): node is Extract<(typeof graph.nodes)[number], { kind: "category" }> => node.kind === "category" && neighborhood.categoryIds.has(node.categoryId))
    .sort((left, right) => left.categoryId - right.categoryId);
  categories.forEach((category, index) => {
    const sparseAngles: Record<number, number[]> = {
      1: [-0.62],
      2: [-0.5, 2.18],
      3: [-1.15, 0.55, 2.72],
    };
    const angle = sparseAngles[categories.length]?.[index]
      ?? -Math.PI / 2 + (index / Math.max(categories.length, 1)) * Math.PI * 2;
    const radius = categories.length === 1 ? 10.8 : 11.4;
    const tilt = index % 2 === 0 ? 0.78 : 1.08;
    const roll = categories.length === 1 ? 0.34 : (index - categories.length / 2) * 0.18;
    positions[category.id] = orbitPoint([0, 0, 0], radius, angle, tilt, roll);
  });

  const contextCategories = graph.nodes
    .filter((node): node is Extract<(typeof graph.nodes)[number], { kind: "category" }> => node.kind === "category" && neighborhood.contextCategoryIds.has(node.categoryId))
    .sort((left, right) => left.level - right.level || left.categoryId - right.categoryId);
  contextCategories.forEach((category, index) => {
    positions[category.id] = companyPeerOrbitPoint(
      [0, 0, 0],
      15.4 + (index % 2) * 2.1,
      index,
      contextCategories.length,
      category.layoutSeed,
    );
  });

  const categoryByPeer = new Map<string, string>();
  graph.edges.forEach((edge) => {
    if (edge.kind !== "relation") return;
    const endpoints = getRelationEndpoints(edge);
    if (!endpoints || !neighborhood.peerCompanyNodeIds.has(endpoints.companyNodeId) || !neighborhood.categoryIds.has(endpoints.categoryId)) return;
    if (!categoryByPeer.has(endpoints.companyNodeId)) categoryByPeer.set(endpoints.companyNodeId, endpoints.categoryNodeId);
  });
  const peersByCategory = new Map<string, string[]>();
  [...neighborhood.peerCompanyNodeIds].sort().forEach((nodeId) => {
    const categoryNodeId = categoryByPeer.get(nodeId) ?? categories[0]?.id;
    if (!categoryNodeId) return;
    const rows = peersByCategory.get(categoryNodeId) ?? [];
    rows.push(nodeId);
    peersByCategory.set(categoryNodeId, rows);
  });
  const peerRows = [...peersByCategory.values()].flat().sort();
  peerRows.forEach((nodeId, index) => {
    const node = nodesById.get(nodeId);
    if (!node) return;
    positions[nodeId] = companyPeerOrbitPoint(
      [0, 0, 0],
      17.6 + (index % 2) * 1.9,
      index,
      peerRows.length,
      node.layoutSeed,
    );
  });

  graph.edges.filter((edge) => edge.kind === "evidenceLink" && neighborhood.evidenceNodeIds.has(edge.target)).forEach((edge, index) => {
    const source = positions[edge.source];
    const node = nodesById.get(edge.target);
    if (!source || !node) return;
    positions[node.id] = orbitPoint(source, 1.15, seededUnit(node.layoutSeed + index) * Math.PI * 2, 1.08, seededUnit(node.layoutSeed + 29) - 0.5);
  });
  graph.nodes.forEach((node, index) => {
    if (positions[node.id]) return;
    const angle = seededUnit(node.layoutSeed + index) * Math.PI * 2;
    const radius = 54 + seededUnit(node.layoutSeed + 9) * 12;
    positions[node.id] = [Math.cos(angle) * radius, Math.sin(angle) * radius, -20 - seededUnit(node.layoutSeed + 7) * 12];
  });
  return positions;
}

export function companyEntityBranch(
  node: IndustryGraphPayload["nodes"][number] | undefined,
  edge: Extract<IndustryGraphPayload["edges"][number], { kind: "entityRelation" }> | undefined,
): CompanyGraphBranch {
  if (!edge || node?.kind !== "entity") return "core";
  if (edge.relationType === "竞争关系") return "peer";
  if (node.entityType === "项目/产能") return "organization";
  if (edge.direction === "inbound") return "upstream";
  if (edge.direction === "outbound") return "downstream";
  return "core";
}

// A camera-facing orbital shell is preferable to a pure Fibonacci sphere for
// small groups. With two or three nodes a Fibonacci sphere projects as a line;
// this layout preserves depth while keeping the relationship structure legible.
function orbitalShellPoint(anchor: GraphPosition, radius: number, index: number, count: number, seed: number): GraphPosition {
  const safeCount = Math.max(count, 1);
  const sparseAngles: Record<number, number[]> = {
    1: [-0.72],
    2: [-0.58, 2.08],
    3: [-1.18, 0.52, 2.68],
  };
  const angle = (sparseAngles[safeCount]?.[index]
    ?? (index / safeCount) * Math.PI * 2 - Math.PI / 2) + seededUnit(seed + 13) * 0.22;
  const ellipse = safeCount <= 3 ? 0.78 : 0.86;
  const depthWave = Math.sin(angle * 1.7 + seededUnit(seed + 29) * Math.PI) * radius * 0.48;
  return [
    anchor[0] + Math.cos(angle) * radius,
    anchor[1] + Math.sin(angle) * radius * ellipse,
    anchor[2] + depthWave,
  ];
}

function companyPeerOrbitPoint(anchor: GraphPosition, radius: number, index: number, count: number, seed: number): GraphPosition {
  const safeCount = Math.max(count, 1);
  const angle = ((index + 0.5) / safeCount) * Math.PI * 2 - Math.PI / 2 + (seededUnit(seed + 13) - 0.5) * 0.16;
  return [
    anchor[0] + Math.cos(angle) * radius,
    anchor[1] + Math.sin(angle) * radius * 0.44,
    anchor[2] + Math.sin(angle * 1.55 + seededUnit(seed + 29) * Math.PI) * radius * 0.46,
  ];
}

function orbitPoint(anchor: GraphPosition, radius: number, angle: number, tilt: number, roll: number): GraphPosition {
  const localX = Math.cos(angle) * radius;
  const localY = Math.sin(angle) * radius * Math.cos(tilt);
  const localZ = Math.sin(angle) * radius * Math.sin(tilt);
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);
  return [
    anchor[0] + localX * cosRoll + localZ * sinRoll,
    anchor[1] + localY,
    anchor[2] - localX * sinRoll + localZ * cosRoll,
  ];
}

export function chooseGraphQuality(input: {
  hardwareConcurrency: number;
  deviceMemory?: number;
  reducedMotion: boolean;
}): GraphQuality {
  if (input.reducedMotion || input.hardwareConcurrency <= 2 || (input.deviceMemory ?? 4) <= 2) {
    return { tier: "reduced", particlesPerEdge: 0, maxLabels: 24, pixelRatio: 1 };
  }
  if (input.hardwareConcurrency <= 6 || (input.deviceMemory ?? 8) <= 4) {
    return { tier: "balanced", particlesPerEdge: 1, maxLabels: 60, pixelRatio: 1.35 };
  }
  return { tier: "full", particlesPerEdge: 2, maxLabels: 120, pixelRatio: 1.75 };
}

function confidenceRank(confidence: "高" | "中" | "低") {
  return confidence === "高" ? 3 : confidence === "中" ? 2 : 1;
}
