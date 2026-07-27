"use client";

import { useMemo } from "react";
import { createFocusedGraphLayout, createGraphLayout } from "@/lib/industry-graph/layout";
import type { IndustryGraphPayload } from "@/lib/industry-graph/types";

export function AtlasMinimap({ graph, focusedCategoryId, selectedNodeId }: {
  graph: IndustryGraphPayload;
  focusedCategoryId: number | null;
  selectedNodeId: string | null;
}) {
  const layout = useMemo(() => focusedCategoryId === null ? createGraphLayout(graph) : createFocusedGraphLayout(graph, focusedCategoryId), [focusedCategoryId, graph]);
  const projected = useMemo(() => {
    const visibleNodes = graph.nodes.filter((node) => {
      const position = layout[node.id];
      return position && Math.abs(position[0]) < 48 && Math.abs(position[2]) < 48;
    });
    const xs = visibleNodes.map((node) => layout[node.id]![0]);
    const ys = visibleNodes.map((node) => layout[node.id]![2]);
    const minX = Math.min(...xs, -1);
    const maxX = Math.max(...xs, 1);
    const minY = Math.min(...ys, -1);
    const maxY = Math.max(...ys, 1);
    const point = (id: string) => {
      const position = layout[id];
      if (!position) return null;
      return {
        x: 8 + ((position[0] - minX) / Math.max(maxX - minX, 1)) * 144,
        y: 8 + ((position[2] - minY) / Math.max(maxY - minY, 1)) * 92,
      };
    };
    return { visibleNodes, point };
  }, [graph.nodes, layout]);

  const visibleIds = new Set(projected.visibleNodes.map((node) => node.id));
  return (
    <div className="atlas-minimap" title="当前星图导航缩略图">
      <svg viewBox="0 0 160 108" role="img" aria-label="当前星图导航缩略图">
        {graph.edges.slice(0, 220).map((edge) => {
          if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return null;
          const source = projected.point(edge.source);
          const target = projected.point(edge.target);
          return source && target ? <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} /> : null;
        })}
        {projected.visibleNodes.map((node) => {
          const point = projected.point(node.id);
          if (!point) return null;
          const selected = node.id === selectedNodeId || node.id === `category:${focusedCategoryId}`;
          return <circle key={node.id} cx={point.x} cy={point.y} r={selected ? 3.2 : node.kind === "category" ? 2 : 0.9} className={`${node.kind} ${selected ? "is-selected" : ""}`} />;
        })}
      </svg>
      <span>ORBIT MAP</span>
    </div>
  );
}
