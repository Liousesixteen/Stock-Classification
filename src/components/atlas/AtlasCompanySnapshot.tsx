"use client";

import { Bot, Building2, ChevronRight, CircleDot, Database, Factory, FileCheck2, GitCompareArrows, Landmark, LoaderCircle, Network, Orbit, Route, ShieldCheck, Sparkles, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import type { Company } from "@/lib/domain/types";
import type { IndustryGraphEdge } from "@/lib/industry-graph/types";
import type { ResearchPath } from "@/lib/industry-graph/pathExplorer";
import type { CompanyDossierQuality } from "@/lib/research/companyDossierQuality";
import type { CompanyGraphBranch } from "@/lib/industry-graph/layout";
import type { BusinessLine } from "@/lib/repositories/researchProfiles";
import { deriveCompanyNarrativeFacts } from "@/lib/industry-graph/companyProfileGraph";
import type { CompanyChainProfile } from "@/lib/industry-graph/companyChainProfiles";
import { AtlasPathExplorer } from "./AtlasPathExplorer";

export type CompanyKnowledgeRelation = {
  id: number;
  entityId: number;
  entityType: "产品/技术" | "客户/供应商" | "项目/产能" | "事件/政策";
  entityName: string;
  entitySummary: string;
  relationType: "核心产品" | "技术关联" | "供应/采购" | "客户验证" | "项目进展" | "政策催化" | "风险传导" | "竞争关系";
  confidence: "高" | "中" | "低";
  rationale: string;
  direction: "undirected" | "inbound" | "outbound" | "bidirectional";
  strength: number;
  observedAt: string;
  verificationStatus: "unverified" | "verified";
  evidenceCount: number;
  evidencePreviews: Array<{ id: number; sourceType: string; title: string; sourceDate: string; url: string; excerpt: string; credibility: "高" | "中" | "低"; verificationStatus: string }>;
};

export type AtlasCompanyState =
  | { status: "idle" }
  | { status: "loading"; name?: string }
  | { status: "error"; message: string; name?: string }
  | {
      status: "ready";
      company: Company;
      relations: Array<{ categoryName: string; relationType: string; confidence: string }>;
      entityRelations?: CompanyKnowledgeRelation[];
      evidenceCount: number;
      summary: string;
      advantages: string[];
      businessLines?: BusinessLine[];
      chainPosition?: string[];
      keyCustomers?: string[];
      sourceSummary?: string;
      quality: Pick<CompanyDossierQuality, "overallScore" | "fieldCoverageScore" | "evidenceCoverageScore" | "reliabilityLabel">;
    };

type GraphRelation = Extract<IndustryGraphEdge, { kind: "relation" }> & { categoryId: number; categoryName: string };
type RelationGroup = "all" | "upstream" | "core" | "downstream" | "peer";

export function AtlasCompanySnapshot({ stockCode, state, chainProfile = null, graphRelations = [], peerCompanies = [], paths = [], activePathId, activeBranch = null, branchCounts, onActivatePath, onFocusCategory, onSelectEntity, onBranchChange, onClose, onOpenResearch, onOpenReport }: {
  stockCode: string | null;
  state: AtlasCompanyState;
  chainProfile?: CompanyChainProfile | null;
  graphRelations?: GraphRelation[];
  peerCompanies?: string[];
  paths?: ResearchPath[];
  activePathId?: string | null;
  onActivatePath?: (path: ResearchPath) => void;
  onFocusCategory?: (categoryId: number | null) => void;
  onSelectEntity?: (entityId: number) => void;
  activeBranch?: CompanyGraphBranch | null;
  branchCounts?: Record<CompanyGraphBranch, number>;
  onBranchChange?: (branch: CompanyGraphBranch | null) => void;
  onClose?: () => void;
  onOpenResearch: (stockCode: string) => void;
  onOpenReport: (stockCode: string) => void;
}) {
  const [view, setView] = useState<"overview" | "relations" | "organization" | "paths">("overview");
  const [relationGroup, setRelationGroup] = useState<RelationGroup>("all");
  useEffect(() => { setView("overview"); setRelationGroup("all"); }, [stockCode]);
  if (!stockCode || state.status === "idle") return <aside className="atlas-company-snapshot is-empty"><div className="atlas-kicker">SELECTED ENTITY</div><p>点击公司节点查看研究快照</p></aside>;

  const loading = state.status === "loading";
  const company = state.status === "ready" ? state.company : null;
  const pendingName = state.status === "loading" || state.status === "error" ? state.name : undefined;
  const name = company?.shortName || pendingName || stockCode;
  const score = state.status === "ready" ? relationScore(state.relations) : "—";
  const profileNodeCount = chainProfile ? chainProfile.hubs.reduce((sum, hub) => sum + 1 + hub.members.length, 0) : null;
  const primaryRelation = graphRelations.find((relation) => relation.relationType === "主营业务" && relation.confidence === "高") ?? graphRelations[0];
  const entityRelations = state.status === "ready" ? state.entityRelations ?? [] : [];
  const narrativeFacts = company ? deriveCompanyNarrativeFacts(company) : { business: [], technology: [] };
  const relationStrength = state.status === "ready" ? primaryRelation?.strength ?? Math.min(100, 38 + state.evidenceCount * 6 + (state.relations[0]?.confidence === "高" ? 24 : state.relations[0]?.confidence === "中" ? 12 : 0)) : 18;
  const strength = state.status === "ready" ? Math.round(relationStrength * 0.65 + state.quality.overallScore * 0.35) : 18;
  const groupedCounts = countGroups(entityRelations);
  const organizationRelations = entityRelations.filter((relation) => relation.entityType === "项目/产能");
  const visibleBranchCounts = branchCounts ?? {
    upstream: groupedCounts.upstream,
    core: groupedCounts.core + graphRelations.length,
    downstream: groupedCounts.downstream,
    organization: organizationRelations.length,
    peer: groupedCounts.peer + Math.max(0, graphRelations.length - 1),
  };
  const filteredRelations = relationGroup === "all" ? entityRelations.filter((relation) => relation.entityType !== "项目/产能") : entityRelations.filter((relation) => groupRelation(relation) === relationGroup);
  const filteredGraphRelations = relationGroup === "all" || relationGroup === "core" ? graphRelations : [];
  const visibleChainHubs = chainProfile?.hubs.filter((hub) => relationGroup === "all" || hub.branch === relationGroup) ?? [];
  const upstreamHub = chainProfile?.hubs.find((hub) => hub.id === "upstream-materials");
  const coreHub = chainProfile?.hubs.find((hub) => hub.id === "core-business");
  const directCustomerHub = chainProfile?.hubs.find((hub) => hub.id === "direct-customers");
  const terminalHub = chainProfile?.hubs.find((hub) => hub.id === "terminal-demand");
  const competitionHub = chainProfile?.hubs.find((hub) => hub.id === "competition");
  const suppliers = uniqueUseful([
    ...(upstreamHub?.members.map((member) => member.name) ?? []),
    ...entityRelations.filter((relation) => relation.direction === "inbound").map((relation) => relation.entityName),
  ]);
  const customers = uniqueUseful([
    ...(directCustomerHub?.members.map((member) => member.name) ?? []),
    ...(terminalHub?.members.map((member) => member.name) ?? []),
    ...(state.status === "ready" ? state.keyCustomers ?? [] : []),
    ...entityRelations.filter((relation) => relation.direction === "outbound").map((relation) => relation.entityName),
  ]);
  const technologies = uniqueUseful([
    ...(state.status === "ready" ? state.advantages.filter(isSpecificTechnology) : []),
    ...narrativeFacts.technology,
    ...entityRelations.filter((relation) => relation.relationType === "技术关联").map((relation) => relation.entityName),
  ]).map(compactFact);
  const businessLines = state.status === "ready" ? (state.businessLines ?? []).filter((line) => usefulFact(line.name) && !/^(当前归类方向|东财行业|相关概念|申万)/.test(line.name.trim())) : [];
  const businessFacts = uniqueUseful([...businessLines.map((line) => line.name), ...narrativeFacts.business]);
  const originalPosition = uniqueUseful([
    ...(state.status === "ready" ? state.chainPosition ?? [] : []),
    ...graphRelations.map((relation) => relation.categoryName),
  ]);
  const competitors = uniqueUseful([
    ...(competitionHub?.members.map((member) => member.name) ?? []),
    ...peerCompanies,
    ...entityRelations.filter((relation) => relation.relationType === "竞争关系").map((relation) => relation.entityName),
  ]);

  return (
    <aside className="atlas-company-snapshot is-company-knowledge" data-testid="atlas-company-snapshot">
      <div className="atlas-snapshot-scroll">
        <div className="atlas-snapshot-head"><div><div className="atlas-kicker">COMPANY KNOWLEDGE GRAPH · {stockCode}</div><h2>{name}</h2></div><div className="atlas-snapshot-actions">{loading ? <LoaderCircle className="atlas-spin" aria-label="资料补全中" /> : <ShieldCheck aria-hidden="true" />}{onClose ? <button type="button" aria-label="关闭公司快照" onClick={onClose}><X aria-hidden="true" /></button> : null}</div></div>
        <p className="atlas-meta">{company ? `${company.board || "A 股"} · ${company.industry || "行业待补"} · ${company.region || "地区待补"}` : "基础资料读取中"}</p>
        <div className="atlas-inspector-tabs is-company-tabs"><button type="button" className={view === "overview" ? "is-active" : ""} onClick={() => setView("overview")}>概览</button><button type="button" className={view === "relations" ? "is-active" : ""} onClick={() => setView("relations")}><Network aria-hidden="true" />产业关系</button><button type="button" className={view === "organization" ? "is-active" : ""} onClick={() => { setView("organization"); onBranchChange?.("organization"); }}><Landmark aria-hidden="true" />股权·组织</button><button type="button" className={view === "paths" ? "is-active" : ""} onClick={() => setView("paths")}><Route aria-hidden="true" />路径</button></div>

        {view === "paths" ? <AtlasPathExplorer paths={paths} activePathId={activePathId ?? null} onActivatePath={(path) => onActivatePath?.(path)} /> : null}
        {view === "overview" ? <>
          {state.status === "error" ? <p className="atlas-error">{state.message}</p> : null}
          <section className="atlas-knowledge-band"><span>关系分层 · 点击展开星图</span><div><button type="button" className={activeBranch === "upstream" ? "is-active" : ""} onClick={() => { setView("relations"); setRelationGroup("upstream"); onBranchChange?.("upstream"); }}><i>UP</i><b>{visibleBranchCounts.upstream}</b><small>上游输入</small></button><button type="button" className={activeBranch === "core" ? "is-active" : ""} onClick={() => { setView("relations"); setRelationGroup("core"); onBranchChange?.("core"); }}><i>CORE</i><b>{visibleBranchCounts.core}</b><small>技术 / 业务</small></button><button type="button" className={activeBranch === "downstream" ? "is-active" : ""} onClick={() => { setView("relations"); setRelationGroup("downstream"); onBranchChange?.("downstream"); }}><i>DOWN</i><b>{visibleBranchCounts.downstream}</b><small>下游应用</small></button><button type="button" className={activeBranch === "peer" ? "is-active" : ""} onClick={() => { setView("relations"); setRelationGroup("peer"); onBranchChange?.("peer"); }}><i>PEER</i><b>{visibleBranchCounts.peer}</b><small>同业关系</small></button></div></section>
          <section className="atlas-company-intro"><div><Building2 aria-hidden="true" /><span>公司速览</span><em>{state.status === "ready" ? state.quality.reliabilityLabel : "待补全"}</em></div><p>{state.status === "ready" && usefulFact(state.summary) ? state.summary : company?.intro || "资料补全中，已可进入研究详情。"}</p></section>
          <div className="atlas-metrics"><div><b>{score}</b><span>产业相关度</span></div><div><b>{profileNodeCount ?? entityRelations.length + graphRelations.length}</b><span>知识节点</span></div><div><b>{state.status === "ready" ? state.evidenceCount : "—"}</b><span>有效证据</span></div></div>
          <section className="atlas-company-fact-section atlas-chain-position"><header><span>原有产业分类主干</span><small>ORIGINAL TAXONOMY</small></header><div className="atlas-fact-chips is-business">{originalPosition.length ? originalPosition.map((item) => <span key={item}>{item}</span>) : <span>{company?.industry || "产业位置待补"}</span>}</div>{chainProfile ? <><p>{chainProfile.positionSummary}</p><div className="atlas-fact-chips">{chainProfile.position.map((item) => <span key={`profile-${item}`}>表格补充 · {item}</span>)}</div></> : null}</section>
          {chainProfile ? <section className="atlas-company-fact-section"><header><span>表格补充产业链关系</span><small>SUPPLEMENT · 6 HUBS</small></header><div className="atlas-chain-hub-list">{chainProfile.hubs.map((hub) => <button type="button" key={hub.id} className={activeBranch === hub.branch ? "is-active" : ""} onClick={() => { setView("relations"); setRelationGroup(hub.branch === "organization" ? "core" : hub.branch); onBranchChange?.(hub.branch); }}><span><b>{hub.title}</b><small>{hub.subtitle}</small></span><em>{hub.members.length ? `${hub.members.length} 家` : `${hub.facts.length} 项`}</em><ChevronRight aria-hidden="true" /></button>)}</div></section> : null}
          <section className="atlas-company-fact-section"><header><span>主要业务</span><small>BUSINESS</small></header>{businessLines.length ? <div className="atlas-business-lines">{businessLines.slice(0, 4).map((line) => <article key={line.name}><b>{line.name}</b><span>{usefulFact(line.share) ? `收入占比 ${line.share}` : "原档案业务"}</span><em>{usefulFact(line.grossMargin) ? `毛利率 ${line.grossMargin}` : ""}</em></article>)}</div> : businessFacts.length ? <div className="atlas-fact-chips is-business">{businessFacts.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div> : null}{coreHub ? <div className="atlas-business-lines">{coreHub.facts.slice(0, 4).map((fact) => <article key={`supplement-${fact.label}`}><b>{fact.label}</b><span>表格补充</span><em>{fact.value}</em></article>)}</div> : businessLines.length || businessFacts.length ? null : <p>主营产品与业务结构待补全。</p>}</section>
          <section className="atlas-company-fact-section"><header><span>核心技术与能力</span><small>TECHNOLOGY</small></header>{technologies.length ? <div className="atlas-fact-chips">{technologies.slice(0, 5).map((item) => <span key={item}>{item}</span>)}</div> : null}{chainProfile ? <div className="atlas-fact-chips"><span>表格补充 · {chainProfile.coreValue}</span><span>表格补充 · {chainProfile.industryStatus}</span></div> : technologies.length ? null : <p>核心技术、工艺平台与产能优势待补充公开依据。</p>}</section>
          <section className="atlas-company-fact-section"><header><span>供货与客户</span><small>SUPPLY / CUSTOMER</small></header><div className="atlas-supply-grid"><article><small>上游供应 / 输入</small>{suppliers.length ? <p>{suppliers.slice(0, 4).join(" · ")}</p> : <p className="is-missing">未找到可核验的具体供应商</p>}</article><article><small>客户 / 供货对象</small>{customers.length ? <p>{customers.slice(0, 5).join(" · ")}</p> : <p className="is-missing">未找到可核验的具体客户</p>}</article></div></section>
          <section className="atlas-company-fact-section"><header><span>竞争关系</span><small>PEERS</small></header>{competitors.length ? <div className="atlas-fact-chips is-peer">{competitors.slice(0, 6).map((item) => <span key={item}>{item}</span>)}</div> : <p>同业竞争公司待补全。</p>}<small className="atlas-fact-note">同业关系来自共同产业分类；不等同于已核验的直接竞争证据。</small></section>
          <section className="atlas-position-map"><div><span>产业链位置</span><small>POSITION</small></div><div className="atlas-position-flow"><p><small>上游</small><b>{suppliers[0] || "材料 / 设备"}</b></p><i /><p className="is-current"><small>自身</small><b>{primaryRelation?.categoryName || company?.industry || "当前环节"}</b></p><i /><p><small>下游</small><b>{customers[0] || "应用 / 客户"}</b></p></div></section>
          <section className="atlas-strength"><div><span>知识完整度</span><b>{state.status === "ready" ? `${strength}%` : "同步中"}</b></div><i><em style={{ width: `${strength}%` }} /></i><small>由产业关系、证据覆盖和公司档案完整度综合计算</small></section>
          {chainProfile ? <p className="atlas-chain-source"><FileCheck2 aria-hidden="true" />当前结构依据：{chainProfile.sourceLabel}；作为研究底稿展示，尚未逐项升级为公开证据。</p> : null}
          {graphRelations.length ? <section className="atlas-relation-chain"><span>关系与证据链</span><div>{graphRelations.map((relation) => <button type="button" key={relation.id} onClick={() => onFocusCategory?.(relation.categoryId)}><div className="atlas-relation-title"><b>{relation.categoryName}</b><em className={relation.evidenceCount > 0 ? "is-verified" : "is-missing"}>{relation.relationType} · {relation.confidence}</em><ChevronRight aria-hidden="true" /></div><p>{relation.rationale || "尚未补充归类依据。"}</p><small><GitCompareArrows aria-hidden="true" />{directionLabel(relation.direction)} · 强度 {relation.strength ?? "待补"} · {relation.observedAt?.slice(0, 10) || "时间待补"}</small><small><FileCheck2 aria-hidden="true" />{relation.evidencePreviews?.length ? relation.evidencePreviews.map((evidence) => evidence.title).join(" · ") : "缺少可追溯证据"}</small></button>)}</div></section> : null}
        </> : null}

        {view === "relations" ? <section className="atlas-company-relations-view"><header><div><Orbit aria-hidden="true" /><span>公司产业链关系</span></div><small>单次只展开一个分支</small></header><div className="atlas-relation-filters">{(["all", "upstream", "core", "downstream", "peer"] as RelationGroup[]).map((group) => <button type="button" key={group} className={relationGroup === group ? "is-active" : ""} onClick={() => { setRelationGroup(group); onBranchChange?.(group === "all" ? null : group); }}>{groupLabel(group)}</button>)}</div><div className="atlas-knowledge-relations">{visibleChainHubs.map((hub) => <button type="button" key={`chain-${hub.id}`} onClick={() => onBranchChange?.(hub.branch)}><div><span className={`atlas-relation-direction is-${hub.branch}`}>{groupLabel(hub.branch === "organization" ? "core" : hub.branch)}</span><em>表格整理</em></div><b>{hub.title}</b><p>{hub.summary}</p><small><FileCheck2 aria-hidden="true" />{hub.facts.length} 项业务事实 · {hub.members.length} 个关联主体</small><span>{hub.members.slice(0, 5).map((member) => member.name).join(" · ") || hub.subtitle}<ChevronRight aria-hidden="true" /></span></button>)}{filteredRelations.map((relation) => <button type="button" key={relation.id} onClick={() => onSelectEntity?.(relation.entityId)}><div><span className={`atlas-relation-direction is-${groupRelation(relation)}`}>{groupLabel(groupRelation(relation))}</span><em>{relation.verificationStatus === "verified" ? "已核验" : "待复核"}</em></div><b>{relation.entityName}</b><p>{relation.rationale || relation.entitySummary}</p><small><FileCheck2 aria-hidden="true" />{relation.evidenceCount} 条证据 · 强度 {relation.strength} · {relation.observedAt?.slice(0, 10) || "时间待补"}</small><span>{relation.evidencePreviews[0]?.title || "暂缺可追溯依据"}<ChevronRight aria-hidden="true" /></span></button>)}{filteredGraphRelations.map((relation) => <button type="button" key={`graph-${relation.id}`} onClick={() => onFocusCategory?.(relation.categoryId)}><div><span className="atlas-relation-direction is-core">核心业务</span><em>{relation.evidenceCount > 0 ? "有证据" : "待补证据"}</em></div><b>{relation.categoryName}</b><p>{relation.rationale || "公司与该产业环节存在直接分类关系。"}</p><small><FileCheck2 aria-hidden="true" />{relation.evidenceCount} 条证据 · 强度 {relation.strength ?? "待补"} · {relation.observedAt?.slice(0, 10) || "时间待补"}</small><span>{relation.evidencePreviews?.[0]?.title || "查看产业链位置"}<ChevronRight aria-hidden="true" /></span></button>)}{visibleChainHubs.length === 0 && filteredRelations.length === 0 && filteredGraphRelations.length === 0 ? <div className="atlas-knowledge-empty"><CircleDot aria-hidden="true" /><b>该关系组仍在补全</b><span>当前不会用推测关系填充星图。</span></div> : null}</div></section> : null}

        {view === "organization" ? <section className="atlas-company-organization"><header><Factory aria-hidden="true" /><div><span>产能与组织节点</span><small>公司公开资料口径</small></div></header>{organizationRelations.length ? <div>{organizationRelations.map((relation) => <button type="button" key={relation.id} onClick={() => onSelectEntity?.(relation.entityId)}><Factory aria-hidden="true" /><span><b>{relation.entityName}</b><small>{relation.entitySummary}</small></span><ChevronRight aria-hidden="true" /></button>)}</div> : <p>产能与组织节点待补全。</p>}<div className="atlas-shareholder-status"><Landmark aria-hidden="true" /><span><b>股东穿透</b><small>需接入交易所定期报告股东数据后展示，当前不使用推测值。</small></span><em>待接入</em></div></section> : null}

        <div className="atlas-sync-state"><Database aria-hidden="true" />{loading ? "后台资料补全中" : state.status === "ready" ? "本地资料与公开证据已就绪" : "基础资料可用"}</div>
      </div>
      <div className="atlas-snapshot-commands">
        {/* LEGACY（按产品要求注释保留）：<button className="is-primary">进入公司研究</button> */}
        <button className="is-primary" type="button" onClick={() => onOpenResearch(stockCode)}><Bot aria-hidden="true" />AI研判</button><button type="button" onClick={() => onOpenReport(stockCode)}><Sparkles aria-hidden="true" />生成研报</button><button type="button" title="加入公司对比"><GitCompareArrows aria-hidden="true" />加入对比</button>
      </div>
    </aside>
  );
}

function groupRelation(relation: CompanyKnowledgeRelation): Exclude<RelationGroup, "all"> {
  if (relation.relationType === "竞争关系") return "peer";
  if (relation.direction === "inbound") return "upstream";
  if (relation.direction === "outbound") return "downstream";
  return "core";
}

function countGroups(relations: CompanyKnowledgeRelation[]) {
  return relations.reduce((counts, relation) => {
    if (relation.entityType !== "项目/产能") counts[groupRelation(relation)] += 1;
    return counts;
  }, { upstream: 0, core: 0, downstream: 0, peer: 0 });
}

function groupLabel(group: RelationGroup) {
  return ({ all: "全部", upstream: "上游", core: "核心业务", downstream: "下游", peer: "同业" } as const)[group];
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

function usefulFact(value: string) {
  const normalized = value.trim();
  return normalized.length >= 2 && !/(待补|未知|暂无|未披露|资料不足|待核实|待跟踪)/.test(normalized);
}

function uniqueUseful(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!usefulFact(value)) return false;
    const key = value.replace(/[\s，,。；;：:、（）()]/g, "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSpecificTechnology(value: string) {
  return usefulFact(value)
    && /(技术|工艺|平台|仿真|Chiplet|晶圆|制程|算法|先进封装|方案)/i.test(value)
    && !/(总部|基地|客户携手|国家政策|市场拉动|降本|成本管控)/.test(value);
}

function compactFact(value: string) {
  const normalized = value.trim().replace(/[。；;]+$/g, "");
  return normalized.length > 30 ? `${normalized.slice(0, 29)}…` : normalized;
}
