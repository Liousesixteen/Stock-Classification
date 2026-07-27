"use client";

import type { IndustryGraphNode, IndustryGraphPayload } from "@/lib/industry-graph/types";

export function GraphFallback({ graph, onSelectNode }: { graph: IndustryGraphPayload; onSelectNode: (node: IndustryGraphNode) => void }) {
  return (
    <div className="atlas-fallback" role="region" aria-label="二维产业链列表">
      <h2>产业链节点列表</h2>
      <p>当前设备无法启动 3D 场景，已切换为可访问列表。</p>
      <div>{graph.nodes.map((node) => <button key={node.id} type="button" onClick={() => onSelectNode(node)}>{node.label}</button>)}</div>
    </div>
  );
}
