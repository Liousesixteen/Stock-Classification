"use client";

import { Bot, Building2, ChevronRight, Database, FileText, FolderOpen, GitCompareArrows, LoaderCircle, Route, ShieldCheck, Sparkles, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import type { Company } from "@/lib/domain/types";
import type { IndustryGraphEdge } from "@/lib/industry-graph/types";
import type { ResearchPath } from "@/lib/industry-graph/pathExplorer";
import type { CompanyDossierQuality } from "@/lib/research/companyDossierQuality";
import { AtlasPathExplorer } from "./AtlasPathExplorer";

export type AtlasCompanyState =
  | { status: "idle" }
  | { status: "loading"; name?: string }
  | { status: "error"; message: string; name?: string }
  | {
      status: "ready";
      company: Company;
      relations: Array<{ categoryName: string; relationType: string; confidence: string }>;
      evidenceCount: number;
      summary: string;
      advantages: string[];
      quality: Pick<CompanyDossierQuality, "overallScore" | "fieldCoverageScore" | "evidenceCoverageScore" | "reliabilityLabel">;
    };

type GraphRelation = Extract<IndustryGraphEdge, { kind: "relation" }> & {
  categoryId: number;
  categoryName: string;
};

export function AtlasCompanySnapshot({ stockCode, state, graphRelations = [], paths = [], activePathId, onActivatePath, onFocusCategory, onClose, onOpenResearch }: { stockCode: string | null; state: AtlasCompanyState; graphRelations?: GraphRelation[]; paths?: ResearchPath[]; activePathId?: string | null; onActivatePath?: (path: ResearchPath) => void; onFocusCategory?: (categoryId: number | null) => void; onClose?: () => void; onOpenResearch: (stockCode: string) => void }) {
  const [view, setView] = useState<"snapshot" | "paths">("snapshot");
  useEffect(() => { setView("snapshot"); }, [stockCode]);
  if (!stockCode || state.status === "idle") {
    return <aside className="atlas-company-snapshot is-empty"><div className="atlas-kicker">SELECTED ENTITY</div><p>点击公司节点查看研究快照</p></aside>;
  }
  const loading = state.status === "loading";
  const company = state.status === "ready" ? state.company : null;
  const pendingName = state.status === "loading" || state.status === "error" ? state.name : undefined;
  const name = company?.shortName || pendingName || stockCode;
  const score = state.status === "ready" ? relationScore(state.relations) : "—";
  const primaryRelation = graphRelations[0];
  const relationStrength = state.status === "ready" ? primaryRelation?.strength ?? Math.min(100, 38 + state.evidenceCount * 6 + (state.relations[0]?.confidence === "高" ? 24 : state.relations[0]?.confidence === "中" ? 12 : 0)) : 18;
  const strength = state.status === "ready" ? Math.round(relationStrength * 0.65 + state.quality.overallScore * 0.35) : 18;

  return (
    <aside className="atlas-company-snapshot" data-testid="atlas-company-snapshot">
      <div className="atlas-snapshot-scroll">
      <div className="atlas-snapshot-head"><div><div className="atlas-kicker">SELECTED ENTITY · {stockCode}</div><h2>{name}</h2></div><div className="atlas-snapshot-actions">{loading ? <LoaderCircle className="atlas-spin" aria-label="资料补全中" /> : <ShieldCheck aria-hidden="true" />}{onClose ? <button type="button" aria-label="关闭公司快照" onClick={onClose}><X aria-hidden="true" /></button> : null}</div></div>
      <p className="atlas-meta">{company ? `${company.board || "A 股"} · ${company.industry || "行业待补"} · ${company.region || "地区待补"}` : "基础资料读取中"}</p>
      <div className="atlas-inspector-tabs"><button type="button" className={view === "snapshot" ? "is-active" : ""} onClick={() => setView("snapshot")}>快照</button><button type="button" className={view === "paths" ? "is-active" : ""} onClick={() => setView("paths")}><Route aria-hidden="true" />路径 <b>{paths.length}</b></button></div>
      {view === "paths" ? <AtlasPathExplorer paths={paths} activePathId={activePathId ?? null} onActivatePath={(path) => onActivatePath?.(path)} /> : <>
      {state.status === "error" ? <p className="atlas-error">{state.message}</p> : null}
      <section className="atlas-company-intro"><div><Building2 aria-hidden="true" /><span>公司速览</span><em>{state.status === "ready" ? state.quality.reliabilityLabel : "待补全"}</em></div><p>{state.status === "ready" ? state.summary : "资料补全中，已可进入研究详情。"}</p></section>
      <div className="atlas-metrics">
        <div><b>{score}</b><span>产业相关度</span></div>
        <div><b>{state.status === "ready" ? `${state.quality.overallScore}%` : "—"}</b><span>档案质量</span></div>
        <div><b>{state.status === "ready" ? state.evidenceCount : "—"}</b><span>有效证据</span></div>
      </div>
      <section className="atlas-position-map"><div><span>产业链位置</span><small>POSITION</small></div><div className="atlas-position-flow"><p><small>上游</small><b>材料 / 设备</b></p><i /><p className="is-current"><small>自身</small><b>{primaryRelation?.categoryName || company?.industry || "当前环节"}</b></p><i /><p><small>下游</small><b>应用 / 客户</b></p></div></section>
      <section className="atlas-strength"><div><span>关系强度</span><b>{state.status === "ready" ? `${strength}%` : "同步中"}</b></div><i><em style={{ width: `${strength}%` }} /></i><small>由关系置信度、有效证据与资料完整度综合计算</small></section>
      <section><span>核心竞争优势</span><p>{state.status === "ready" ? state.advantages.slice(0, 2).join("；") || "技术、客户与交付能力待补充" : "正在整理结构化资料"}</p></section>
      {state.status === "ready" && graphRelations.length ? <section className="atlas-relation-chain"><span>关系与证据链</span><div>{graphRelations.map((relation) => <button type="button" key={relation.id} onClick={() => onFocusCategory?.(relation.categoryId)}>
        <div className="atlas-relation-title"><b>{relation.categoryName}</b><em className={relation.evidenceCount > 0 ? "is-verified" : "is-missing"}>{relation.relationType} · {relation.confidence}</em><ChevronRight aria-hidden="true" /></div>
        <p>{relation.rationale || "尚未补充归类依据。"}</p>
        <small><GitCompareArrows aria-hidden="true" />{directionLabel(relation.direction)} · 强度 {relation.strength ?? "待补"} · {relation.observedAt?.slice(0, 10) || "时间待补"}</small>
        <small><FileText aria-hidden="true" />{relation.evidencePreviews?.length ? relation.evidencePreviews.map((evidence) => evidence.title).join(" · ") : "缺少可追溯证据"}</small>
      </button>)}</div></section> : null}
      <div className="atlas-sync-state"><Database aria-hidden="true" />{loading ? "后台资料补全中" : state.status === "ready" ? "本地资料已就绪" : "基础资料可用"}</div>
      </>}
      </div>
      {view === "snapshot" ? <div className="atlas-snapshot-commands"><button className="is-primary" type="button" aria-label="进入公司研究详情" onClick={() => onOpenResearch(stockCode)}><FolderOpen aria-hidden="true" />查看公司档案</button><button type="button" onClick={() => onOpenResearch(stockCode)}><Bot aria-hidden="true" />询问 AI</button><button type="button" onClick={() => onOpenResearch(stockCode)}><Sparkles aria-hidden="true" />联合研究</button><button type="button" title="加入公司对比"><GitCompareArrows aria-hidden="true" />加入对比</button></div> : null}
    </aside>
  );
}

function relationScore(relations: Array<{ relationType: string; confidence: string }>) {
  const relation = relations[0];
  if (!relation) return "待补";
  const type = relation.relationType === "主营业务" ? 5 : relation.relationType === "重要相关" ? 4 : 3;
  const confidence = relation.confidence === "高" ? 0 : relation.confidence === "中" ? -0.4 : -0.8;
  return Math.max(1, type + confidence).toFixed(1);
}

function directionLabel(value: GraphRelation["direction"]) {
  return ({ undirected: "关联", inbound: "上游 → 公司", outbound: "公司 → 下游", bidirectional: "双向" } as const)[value ?? "undirected"];
}
