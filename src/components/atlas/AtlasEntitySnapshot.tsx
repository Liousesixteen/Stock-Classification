"use client";

import { ArrowRight, FileText, GitCompareArrows, Network, Route, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import type { IndustryGraphEdge, IndustryGraphNode } from "@/lib/industry-graph/types";
import type { ResearchPath } from "@/lib/industry-graph/pathExplorer";
import { AtlasPathExplorer } from "./AtlasPathExplorer";

type EntityNode = Extract<IndustryGraphNode, { kind: "entity" }>;
type EntityRelation = Extract<IndustryGraphEdge, { kind: "entityRelation" }> & { companyName: string };

export function AtlasEntitySnapshot({ entity, relations, paths = [], activePathId, onActivatePath, onClose, onOpenCompany }: { entity: EntityNode; relations: EntityRelation[]; paths?: ResearchPath[]; activePathId?: string | null; onActivatePath?: (path: ResearchPath) => void; onClose: () => void; onOpenCompany: (stockCode: string) => void }) {
  const [view, setView] = useState<"snapshot" | "paths">("snapshot");
  useEffect(() => { setView("snapshot"); }, [entity.entityId]);
  return <aside className="atlas-company-snapshot atlas-entity-snapshot" data-testid="atlas-entity-snapshot">
    <div className="atlas-snapshot-head"><div><div className="atlas-kicker">RESEARCH ENTITY · {entity.entityType}</div><h2>{entity.label}</h2></div><div className="atlas-snapshot-actions"><Network aria-hidden="true" /><button type="button" aria-label="关闭实体快照" onClick={onClose}><X aria-hidden="true" /></button></div></div>
    <p className="atlas-meta">外部研究实体 · {entity.evidenceCount} 条有效证据</p>
    <div className="atlas-inspector-tabs"><button type="button" className={view === "snapshot" ? "is-active" : ""} onClick={() => setView("snapshot")}>快照</button><button type="button" className={view === "paths" ? "is-active" : ""} onClick={() => setView("paths")}><Route aria-hidden="true" />路径 <b>{paths.length}</b></button></div>
    {view === "paths" ? <AtlasPathExplorer paths={paths} activePathId={activePathId ?? null} onActivatePath={(path) => onActivatePath?.(path)} /> : <>
    <section><span>实体说明</span><p>{entity.summary || "尚未补充实体说明。"}</p></section>
    <div className="atlas-metrics"><div><b>{relations.length}</b><span>关联公司</span></div><div><b>{entity.evidenceCount}</b><span>有效证据</span></div><div><b>{entity.entityType}</b><span>实体类型</span></div></div>
    <section className="atlas-relation-chain"><span>公司关系链</span><div>{relations.length ? relations.map((relation) => <button type="button" key={relation.id} onClick={() => onOpenCompany(relation.source.replace("company:", ""))}>
      <div className="atlas-relation-title"><b>{relation.companyName}</b><em className={relation.evidenceCount > 0 ? "is-verified" : "is-missing"}>{relation.relationType} · {relation.confidence}</em><ArrowRight aria-hidden="true" /></div>
      <p>{relation.rationale}</p><small><GitCompareArrows aria-hidden="true" />{directionLabel(relation.direction)} · 强度 {relation.strength ?? "待补"} · {relation.observedAt?.slice(0, 10) || "时间待补"}</small><small><FileText aria-hidden="true" />{relation.evidencePreviews.map((evidence) => evidence.title).join(" · ") || "缺少可追溯证据"}</small>
    </button>) : <p>暂无关联公司。</p>}</div></section>
    </>}
  </aside>;
}

function directionLabel(value: EntityRelation["direction"]) {
  return ({ undirected: "关联", inbound: "上游 → 公司", outbound: "公司 → 下游", bidirectional: "双向" } as const)[value ?? "undirected"];
}
