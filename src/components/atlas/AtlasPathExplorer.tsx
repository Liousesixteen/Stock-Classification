"use client";

import { ChevronRight, CircleAlert, FileWarning, Route, ShieldCheck } from "lucide-react";
import React, { useMemo, useState } from "react";
import type { ResearchPath } from "@/lib/industry-graph/pathExplorer";

type PathFilter = "全部" | "多源验证" | "单源待核" | "缺证据" | "待验证";

export function AtlasPathExplorer({ paths, activePathId, onActivatePath }: { paths: ResearchPath[]; activePathId: string | null; onActivatePath: (path: ResearchPath) => void }) {
  const [filter, setFilter] = useState<PathFilter>("全部");
  const visiblePaths = useMemo(() => paths.filter((path) => filter === "全部" || path.verification === filter), [filter, paths]);
  const counts = useMemo(() => paths.reduce<Record<PathFilter, number>>((result, path) => { result[path.verification] += 1; return result; }, { 全部: paths.length, 多源验证: 0, 单源待核: 0, 缺证据: 0, 待验证: 0 }), [paths]);

  return <section className="atlas-path-explorer" aria-label="关系推演">
    <div className="atlas-path-heading"><div><span>RESEARCH PATHS</span><h3>关系推演</h3></div><b>{paths.length} 条</b></div>
    <p className="atlas-path-intro">最多三跳，优先展示公司与研究实体之间可追溯的传导链。</p>
    <div className="atlas-path-filters">{(["全部", "多源验证", "单源待核", "缺证据", "待验证"] as PathFilter[]).map((item) => <button key={item} type="button" className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}<b>{counts[item]}</b></button>)}</div>
    <div className="atlas-path-list">{visiblePaths.length ? visiblePaths.map((path) => <button type="button" key={path.id} className={`atlas-path-card ${activePathId === path.id ? "is-active" : ""}`} onClick={() => onActivatePath(path)}>
      <div className="atlas-path-card-head"><VerificationIcon verification={path.verification} /><span>{path.verification}</span><em>{path.evidenceCount} 证据 · {path.independentSourceCount} 来源</em></div>
      <div className="atlas-path-route">{path.nodes.map((node, index) => <span key={node.id}><b className={`is-${node.kind}`}>{node.label}</b>{index < path.nodes.length - 1 ? <ChevronRight aria-hidden="true" /> : null}</span>)}</div>
      <p>{path.nextAction}</p>
    </button>) : <div className="atlas-path-empty">当前筛选下没有可推演路径。</div>}</div>
  </section>;
}

function VerificationIcon({ verification }: { verification: ResearchPath["verification"] }) {
  if (verification === "多源验证") return <ShieldCheck aria-hidden="true" />;
  if (verification === "缺证据") return <FileWarning aria-hidden="true" />;
  if (verification === "待验证") return <CircleAlert aria-hidden="true" />;
  return <Route aria-hidden="true" />;
}
