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

  const categoryIds = new Set<number>([focusCategoryId]);
  const queue = [focusCategoryId];
  while (queue.length) {
    const parentId = queue.shift()!;
    for (const childId of childIds.get(parentId) ?? []) {
      if (categoryIds.has(childId)) continue;
      categoryIds.add(childId);
      queue.push(childId);
    }
  }

  const companyNodeIds = new Set(graph.edges.flatMap((edge) => {
    if (edge.kind !== "relation") return [];
    const endpoints = getRelationEndpoints(edge);
    return endpoints && categoryIds.has(endpoints.categoryId) ? [endpoints.companyNodeId] : [];
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

  const entityNodeIds = new Set(graph.edges
    .filter((edge) => edge.kind === "entityRelation" && companyNodeIds.has(edge.source))
    .map((edge) => edge.target));
  const evidenceNodeIds = new Set(graph.edges
    .filter((edge) => edge.kind === "evidenceLink" && (companyNodeIds.has(edge.source) || entityNodeIds.has(edge.source)))
    .map((edge) => edge.target));
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
        && categoryIds.has(endpoints.categoryId)
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
    const angle = ((index - 1) / Math.max(roots.length - 1, 1)) * Math.PI * 2;
    positions[root.id] = [Math.cos(angle) * 18, ((index % 3) - 1) * 2.5, Math.sin(angle) * 18];
  });

  const hierarchyEdges = graph.edges.filter((edge) => edge.kind === "hierarchy");
  for (let depth = 1; depth <= 16; depth += 1) {
    for (const edge of hierarchyEdges) {
      const node = nodesById.get(edge.target);
      const parent = positions[edge.source];
      if (!node || node.kind !== "category" || node.level !== depth || !parent) continue;
      const radius = Math.max(3.2, 7.8 - depth * 0.65);
      positions[node.id] = add(parent, offset(node.layoutSeed, radius, 4.2));
    }
  }

  const relationEdges = graph.edges.filter((edge) => edge.kind === "relation");
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
    positions[category.id] = spherePoint(
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
    return endpoints && descendants.has(endpoints.categoryId) ? [{ edge, endpoints }] : [];
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
          positions[node.id] = spherePoint(
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

function spherePoint(anchor: GraphPosition, radius: number, index: number, count: number, seed: number): GraphPosition {
  const safeCount = Math.max(count, 1);
  const latitude = 1 - 2 * ((index + 0.5) / safeCount);
  const ringRadius = Math.sqrt(Math.max(0, 1 - latitude * latitude));
  const azimuth = index * Math.PI * (3 - Math.sqrt(5)) + seededUnit(seed + 13) * 0.72;
  const depthBias = 0.84 + seededUnit(seed + 29) * 0.34;
  return [
    anchor[0] + Math.cos(azimuth) * ringRadius * radius,
    anchor[1] + latitude * radius * 0.88,
    anchor[2] + Math.sin(azimuth) * ringRadius * radius * depthBias,
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
