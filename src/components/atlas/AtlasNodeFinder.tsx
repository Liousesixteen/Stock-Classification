"use client";

import { Search, X } from "lucide-react";
import React, { useMemo, useState } from "react";
import type { IndustryGraphNode } from "@/lib/industry-graph/types";

export function AtlasNodeFinder({
  nodes,
  onSelect,
  embedded = false,
}: {
  nodes: IndustryGraphNode[];
  onSelect: (node: IndustryGraphNode) => void;
  embedded?: boolean;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return nodes
      .filter((node) => node.label.toLowerCase().includes(normalized) || (node.kind === "company" && node.stockCode.includes(normalized)))
      .slice(0, 7);
  }, [nodes, query]);

  return (
    <div className={`atlas-node-finder ${embedded ? "is-embedded" : ""}`}>
      <Search aria-hidden="true" />
      <input
        aria-label="定位产业或公司"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="定位公司 / 产业 / 证据"
      />
      {query ? <button type="button" aria-label="清空定位" onClick={() => setQuery("")}><X aria-hidden="true" /></button> : null}
      {query ? (
        <div className="atlas-node-results" role="listbox" aria-label="定位结果">
          {matches.length ? matches.map((node) => (
            <button
              key={node.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => {
                onSelect(node);
                setQuery("");
              }}
            >
              <span>{node.label}</span>
              <b>{node.kind === "company" ? node.stockCode : node.kind === "category" ? `L${node.level}` : node.kind === "entity" ? node.entityType : node.sourceType}</b>
            </button>
          )) : <p>未找到匹配节点</p>}
        </div>
      ) : null}
    </div>
  );
}
