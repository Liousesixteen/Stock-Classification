"use client";

import { useMemo } from "react";
import { createCompanyFocusedGraphLayout, createFocusedGraphLayout, createGraphLayout, getCompanyFocusedGraphNeighborhood, getFocusedGraphNeighborhood, type CompanyGraphBranch } from "@/lib/industry-graph/layout";
import type { IndustryGraphPayload } from "@/lib/industry-graph/types";

export function AtlasMinimap({ graph, focusedCategoryId, focusedCompanyCode, expandedCompanyBranch, selectedNodeId }: {
  graph: IndustryGraphPayload;
  focusedCategoryId: number | null;
  focusedCompanyCode: string | null;
  expandedCompanyBranch?: CompanyGraphBranch | null;
  selectedNodeId: string | null;
}) {
  const layout = useMemo(() => focusedCompanyCode
    ? createCompanyFocusedGraphLayout(graph, focusedCompanyCode, expandedCompanyBranch)
    : focusedCategoryId === null ? createGraphLayout(graph) : createFocusedGraphLayout(graph, focusedCategoryId), [expandedCompanyBranch, focusedCategoryId, focusedCompanyCode, graph]);
  const visibleNodeIds = useMemo(() => {
    if (focusedCompanyCode) return getCompanyFocusedGraphNeighborhood(graph, focusedCompanyCode, expandedCompanyBranch).visibleNodeIds;
    if (focusedCategoryId !== null) return getFocusedGraphNeighborhood(graph, focusedCategoryId).visibleNodeIds;
    return new Set(graph.nodes.filter((node) => node.kind === "category" && node.level <= 1).map((node) => node.id));
  }, [expandedCompanyBranch, focusedCategoryId, focusedCompanyCode, graph]);
  const projected = useMemo(() => {
    const visibleNodes = graph.nodes.filter((node) => visibleNodeIds.has(node.id) && layout[node.id]);
    const xs = visibleNodes.map((node) => layout[node.id]![0]);
    const ys = visibleNodes.map((node) => layout[node.id]![1]);
    const minX = Math.min(...xs, -1);
    const maxX = Math.max(...xs, 1);
    const minY = Math.min(...ys, -1);
    const maxY = Math.max(...ys, 1);
    const point = (id: string) => {
      const position = layout[id];
      if (!position) return null;
      return {
        x: 12 + ((position[0] - minX) / Math.max(maxX - minX, 1)) * 156,
        y: 12 + ((maxY - position[1]) / Math.max(maxY - minY, 1)) * 104,
      };
    };
    return { visibleNodes, point };
  }, [graph.nodes, layout, visibleNodeIds]);

  const visibleIds = new Set(projected.visibleNodes.map((node) => node.id));
  return (
    <div className="atlas-minimap" title="当前星图导航缩略图">
      <svg viewBox="0 0 180 128" role="img" aria-label="当前星图导航缩略图">
        <ellipse className="orbit" cx="90" cy="64" rx="70" ry="42" />
        <ellipse className="orbit is-inner" cx="90" cy="64" rx="42" ry="24" />
        {graph.edges.map((edge) => {
          if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return null;
          const source = projected.point(edge.source);
          const target = projected.point(edge.target);
          return source && target ? <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} /> : null;
        })}
        {projected.visibleNodes.map((node) => {
          const point = projected.point(node.id);
          if (!point) return null;
          const selected = node.id === selectedNodeId || node.id === (focusedCompanyCode ? `company:${focusedCompanyCode}` : `category:${focusedCategoryId}`);
          return <circle key={node.id} cx={point.x} cy={point.y} r={selected ? 4 : node.kind === "category" ? 2.6 : node.kind === "entity" ? 2 : 1.5} className={`${node.kind} ${selected ? "is-selected" : ""}`} />;
        })}
      </svg>
      <span>ORBIT MAP</span>
    </div>
  );
}
