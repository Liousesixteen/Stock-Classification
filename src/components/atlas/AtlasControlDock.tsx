"use client";

import { Boxes, Check, GripVertical, RotateCcw, Share2 } from "lucide-react";
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
  companyFocus,
  onSelectNode,
  onSelectCategory,
  onReset,
  signalFilter = "all",
  onSignalFilterChange = () => undefined,
  stats = { categoryCount: 0, companyCount: 0, evidenceCount: 0 },
}: {
  nodes: IndustryGraphNode[];
  focus: FocusContext | null;
  companyFocus?: { labels: string[]; relationGroupCount: number; relatedCompanyCount: number; onBack: () => void; onReset: () => void } | null;
  onSelectNode: (node: IndustryGraphNode) => void;
  onSelectCategory: (categoryId: number | null) => void;
  onReset?: () => void;
  signalFilter?: IndustryGraphSignalFilter;
  onSignalFilterChange?: (value: IndustryGraphSignalFilter) => void;
  stats?: { categoryCount: number; companyCount: number; evidenceCount: number };
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
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
  const copyAtlasLink = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(window.location.href);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1800);
  };

  return (
    <div className={`atlas-control-dock ${focus || companyFocus ? "has-focus-trail" : ""} ${dragOrigin ? "is-dragging" : ""}`} style={style}>
      <button className="atlas-dock-handle" type="button" aria-label="拖动聚焦控制台" title="拖动聚焦控制台" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <GripVertical aria-hidden="true" />
      </button>
      <div className="atlas-control-main"><AtlasNodeFinder nodes={nodes} onSelect={onSelectNode} embedded /><div className="atlas-control-filters"><span><Boxes aria-hidden="true" />{companyFocus ? "公司知识星图" : focus ? "局部立体" : "产业链全景"}</span><select aria-label="证据信号筛选" value={signalFilter} onChange={(event) => onSignalFilterChange(event.target.value as IndustryGraphSignalFilter)}><option value="all">全部关系</option><option value="upstream">上游输入</option><option value="downstream">下游输出</option><option value="verified">已证实</option><option value="review">待复核</option><option value="missingEvidence">缺证据</option><option value="watchlist">重点跟踪</option></select><b>{stats.categoryCount} 节点 · {stats.companyCount} 公司 · {stats.evidenceCount} 证据</b><button type="button" className={copyState === "copied" ? "is-copied" : ""} aria-label={copyState === "copied" ? "图谱链接已复制" : copyState === "failed" ? "图谱链接复制失败" : "复制当前图谱链接"} title={copyState === "copied" ? "链接已复制" : copyState === "failed" ? "复制失败，请从地址栏复制" : "复制当前图谱链接"} onClick={copyAtlasLink}>{copyState === "copied" ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}</button>{onReset ? <button type="button" aria-label="重置星图" title="重置星图" onClick={onReset}><RotateCcw aria-hidden="true" /></button> : null}<span className="atlas-copy-status" aria-live="polite">{copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : ""}</span></div></div>
      {companyFocus ? <AtlasFocusTrail labels={companyFocus.labels} categoryCount={companyFocus.relationGroupCount} companyCount={companyFocus.relatedCompanyCount} categoryCountLabel="层关系" companyCountLabel="家直接相关公司" onReset={companyFocus.onReset} onBack={companyFocus.onBack} embedded /> : focus ? <AtlasFocusTrail labels={focus.labels} categoryCount={focus.categoryCount} companyCount={focus.companyCount} onReset={() => onSelectCategory(null)} onBack={() => onSelectCategory(focus.parentId)} embedded /> : null}
    </div>
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function coordinate(value: number) {
  return Number.isFinite(value) ? value : 0;
}
