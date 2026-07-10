import type { IndustryGraphPayload } from "./types";

export type GraphPosition = [number, number, number];

export type GraphQuality = {
  tier: "full" | "balanced" | "reduced";
  particlesPerEdge: number;
  maxLabels: number;
  pixelRatio: number;
};

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
    if (positions[edge.target]) return;
    const node = nodesById.get(edge.target);
    const parent = positions[edge.source];
    if (!node || node.kind !== "company" || !parent) return;
    positions[node.id] = add(parent, offset(node.layoutSeed + index, 3.4, 3));
  });

  graph.nodes.forEach((node, index) => {
    if (!positions[node.id]) {
      positions[node.id] = add([index * 1.5, 0, 0], offset(node.layoutSeed, 5, 6));
    }
  });

  return positions;
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
