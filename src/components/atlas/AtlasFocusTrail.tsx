"use client";

import { ArrowUpRight, ChevronLeft, ChevronRight, Focus, Maximize2 } from "lucide-react";
import React from "react";

export type AtlasFocusTrailProps = {
  labels: string[];
  categoryCount: number;
  companyCount: number;
  onBack: () => void;
  onReset: () => void;
  onOpenSectorResearch?: () => void;
};

export function AtlasFocusTrail({ labels, categoryCount, companyCount, onBack, onReset, onOpenSectorResearch, embedded = false }: AtlasFocusTrailProps & { embedded?: boolean }) {
  if (!labels.length) return null;

  return (
    <aside className={`atlas-focus-trail ${embedded ? "is-embedded" : ""}`} aria-label="当前图谱聚焦路径">
      <div className="atlas-focus-title"><Focus aria-hidden="true" /><span>FOCUS MODE</span><b>局部星图</b></div>
      <div className="atlas-breadcrumbs">
        <button type="button" onClick={onReset}>全景</button>
        {labels.map((label) => <span key={label}><ChevronRight aria-hidden="true" />{label}</span>)}
      </div>
      <div className="atlas-focus-stats"><span><Maximize2 aria-hidden="true" />{categoryCount} 个环节</span><span>{companyCount} 家相关公司</span></div>
      <div className="atlas-focus-actions"><button className="atlas-focus-back" type="button" onClick={onBack}><ChevronLeft aria-hidden="true" />返回上层</button>{onOpenSectorResearch ? <button className="atlas-focus-open" type="button" onClick={onOpenSectorResearch}>赛道研究<ArrowUpRight aria-hidden="true" /></button> : null}</div>
    </aside>
  );
}
