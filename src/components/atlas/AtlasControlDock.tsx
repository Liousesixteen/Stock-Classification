"use client";

import { Boxes, GripVertical, Share2 } from "lucide-react";
import React, { type CSSProperties, useState, type PointerEvent } from "react";
import type { IndustryGraphNode, IndustryGraphSignalFilter } from "@/lib/industry-graph/types";
import { AtlasFocusTrail } from "./AtlasFocusTrail";
import { AtlasNodeFinder } from "./AtlasNodeFinder";

type FocusContext = {
  labels: string[];
  categoryCount: number;
  companyCount: number;
  parentId: number | null;
  categoryId: number;
};

export function AtlasControlDock({
  nodes,
  focus,
  onSelectNode,
  onSelectCategory,
  onOpenSectorResearch,
  signalFilter = "all",
  onSignalFilterChange = () => undefined,
  stats = { categoryCount: 0, companyCount: 0, evidenceCount: 0 },
}: {
  nodes: IndustryGraphNode[];
  focus: FocusContext | null;
  onSelectNode: (node: IndustryGraphNode) => void;
  onSelectCategory: (categoryId: number | null) => void;
  onOpenSectorResearch?: (categoryId: number) => void;
  signalFilter?: IndustryGraphSignalFilter;
  onSignalFilterChange?: (value: IndustryGraphSignalFilter) => void;
  stats?: { categoryCount: number; companyCount: number; evidenceCount: number };
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const style = { "--atlas-dock-x": `${offset.x}px`, "--atlas-dock-y": `${offset.y}px` } as CSSProperties;

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if ("setPointerCapture" in event.currentTarget) event.currentTarget.setPointerCapture(event.pointerId);
    setDragOrigin({ x: coordinate(event.clientX), y: coordinate(event.clientY), offsetX: offset.x, offsetY: offset.y });
  };
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragOrigin) return;
    const maxX = Math.max(90, Math.floor(window.innerWidth * 0.31));
    const maxY = Math.max(46, Math.floor(window.innerHeight * 0.22));
    setOffset({
      x: clamp(dragOrigin.offsetX + coordinate(event.clientX) - dragOrigin.x, -maxX, maxX),
      y: clamp(dragOrigin.offsetY + coordinate(event.clientY) - dragOrigin.y, -maxY, maxY),
    });
  };
  const endDrag = () => setDragOrigin(null);

  return (
    <div className={`atlas-control-dock ${dragOrigin ? "is-dragging" : ""}`} style={style}>
      <button className="atlas-dock-handle" type="button" aria-label="拖动聚焦控制台" title="拖动聚焦控制台" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <GripVertical aria-hidden="true" />
      </button>
      <div className="atlas-control-main"><AtlasNodeFinder nodes={nodes} onSelect={onSelectNode} embedded /><div className="atlas-control-filters"><span><Boxes aria-hidden="true" />{focus ? "局部立体" : "产业链全景"}</span><select aria-label="证据信号筛选" value={signalFilter} onChange={(event) => onSignalFilterChange(event.target.value as IndustryGraphSignalFilter)}><option value="all">全部关系</option><option value="upstream">上游输入</option><option value="downstream">下游输出</option><option value="verified">已证实</option><option value="review">待复核</option><option value="missingEvidence">缺证据</option><option value="watchlist">重点跟踪</option></select><b>{stats.categoryCount} 节点 · {stats.companyCount} 公司 · {stats.evidenceCount} 证据</b><button type="button" aria-label="复制当前图谱链接" title="复制当前图谱链接" onClick={() => navigator.clipboard?.writeText(window.location.href)}><Share2 aria-hidden="true" /></button></div></div>
      {focus ? <AtlasFocusTrail labels={focus.labels} categoryCount={focus.categoryCount} companyCount={focus.companyCount} onReset={() => onSelectCategory(null)} onBack={() => onSelectCategory(focus.parentId)} onOpenSectorResearch={onOpenSectorResearch ? () => onOpenSectorResearch(focus.categoryId) : undefined} embedded /> : null}
    </div>
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function coordinate(value: number) {
  return Number.isFinite(value) ? value : 0;
}
