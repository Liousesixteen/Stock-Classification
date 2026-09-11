"use client";

import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import React, { useEffect, useRef } from "react";

export type AtlasFocusTrailProps = {
  labels: string[];
  categoryCount: number;
  companyCount: number;
  categoryCountLabel?: string;
  companyCountLabel?: string;
  onBack: () => void;
  onReset: () => void;
};

export function AtlasFocusTrail({ labels, categoryCount, companyCount, categoryCountLabel = "个环节", companyCountLabel = "家相关公司", onBack, onReset, embedded = false }: AtlasFocusTrailProps & { embedded?: boolean }) {
  const breadcrumbsRef = useRef<HTMLDivElement>(null);
  const pathKey = labels.join("\u0000");
  const scrollPath = (direction: -1 | 1) => {
    const trail = breadcrumbsRef.current;
    if (!trail) return;
    trail.scrollBy({ left: direction * Math.max(160, trail.clientWidth * 0.72), behavior: "smooth" });
  };

  useEffect(() => {
    const trail = breadcrumbsRef.current;
    if (!trail) return;

    const revealCurrentNode = () => {
      trail.style.scrollBehavior = "auto";
      trail.scrollLeft = trail.scrollWidth;
      trail.style.removeProperty("scroll-behavior");
    };
    const frame = window.requestAnimationFrame(revealCurrentNode);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(revealCurrentNode);
    observer?.observe(trail);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [pathKey]);

  if (!labels.length) return null;

  return (
    <aside className={`atlas-focus-trail ${embedded ? "is-embedded" : ""}`} aria-label="当前图谱聚焦路径">
      <div className="atlas-breadcrumbs" ref={breadcrumbsRef} tabIndex={0} aria-label="当前节点路径" onWheel={(event) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY; }}>
        <button className="atlas-path-scroll is-left" type="button" aria-label="向左浏览上级路径" title="查看上级分类" onClick={() => scrollPath(-1)}><ChevronLeft aria-hidden="true" /></button>
        <button type="button" onClick={onReset}>全景</button>
        {labels.map((label, index) => <span key={`${label}-${index}`} title={label} aria-current={index === labels.length - 1 ? "page" : undefined}><ChevronRight aria-hidden="true" />{label}</span>)}
        <button className="atlas-path-scroll is-right" type="button" aria-label="向右浏览下级路径" title="查看下级分类" onClick={() => scrollPath(1)}><ChevronRight aria-hidden="true" /></button>
      </div>
      <div className="atlas-focus-stats"><span><span><Maximize2 aria-hidden="true" />{categoryCount} {categoryCountLabel}</span><i aria-hidden="true" /><span>{companyCount} {companyCountLabel}</span></span></div>
      <div className="atlas-focus-actions"><button className="atlas-focus-back" type="button" onClick={onBack}><ChevronLeft aria-hidden="true" />返回上层</button>{/* LEGACY（按产品要求隐藏）：原“赛道研究”快捷入口。 */}</div>
    </aside>
  );
}
