"use client";

import { Building2, ChevronRight, Layers3, MousePointer2, Radar, Route, Sparkles } from "lucide-react";
import React from "react";
import { useMemo } from "react";
import type { IndustryGraphPayload } from "@/lib/industry-graph/types";
import { getRelationEndpoints } from "@/lib/industry-graph/relations";

export type AtlasFocusContext = {
  categoryId: number;
  labels: string[];
  categoryCount: number;
  companyCount: number;
  parentId: number | null;
};

export function AtlasFocusSnapshot({ graph, focus, onSelectCompany }: {
  graph: IndustryGraphPayload;
  focus: AtlasFocusContext | null;
  onSelectCompany: (stockCode: string) => void;
}) {
  const companies = useMemo(() => {
    const categoryIds = focus ? collectCategoryIds(graph, focus.categoryId) : null;
    const companyById = new Map(graph.nodes.filter((node) => node.kind === "company").map((node) => [node.id, node]));
    const rows = graph.edges
      .filter((edge) => edge.kind === "relation")
      .map((edge) => ({ edge, endpoints: getRelationEndpoints(edge) }))
      .filter((row) => row.endpoints && (!categoryIds || categoryIds.has(row.endpoints.categoryId)))
      .map(({ edge, endpoints }) => ({ edge, company: companyById.get(endpoints!.companyNodeId) }))
      .filter((row): row is { edge: Extract<typeof row.edge, { kind: "relation" }>; company: Extract<(typeof graph.nodes)[number], { kind: "company" }> } => Boolean(row.company));
    const deduped = new Map<string, (typeof rows)[number]>();
    rows.sort((left, right) => right.edge.evidenceCount - left.edge.evidenceCount || left.company.label.localeCompare(right.company.label));
    rows.forEach((row) => { if (!deduped.has(row.company.stockCode)) deduped.set(row.company.stockCode, row); });
    return [...deduped.values()].slice(0, 7);
  }, [focus, graph]);

  const evidenceCount = companies.reduce((sum, row) => sum + row.edge.evidenceCount, 0);
  const title = focus?.labels.at(-1) ?? "产业链全景";

  return (
    <aside className="atlas-focus-snapshot" aria-label={`${title}产业概览`}>
      <header>
        <div><small>INDUSTRY NODE</small><h2>{title}</h2></div>
        <Radar aria-hidden="true" />
      </header>
      {focus ? <div className="atlas-focus-path" aria-label="当前产业路径">{focus.labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div> : null}
      <p className="atlas-focus-summary">
        {focus ? `当前局部星系覆盖 ${focus.companyCount} 家相关公司，按产业关系与证据密度组织。` : "从全景进入产业节点，查看局部环节、关联公司与证据路径。"}
      </p>
      <div className="atlas-focus-metrics">
        <div><Building2 aria-hidden="true" /><b>{focus?.companyCount ?? graph.stats.companyCount}</b><span>关联公司</span></div>
        <div><Layers3 aria-hidden="true" /><b>{focus?.categoryCount ?? graph.stats.categoryCount}</b><span>产业节点</span></div>
        <div><Route aria-hidden="true" /><b>{focus ? evidenceCount : graph.stats.evidenceCount}</b><span>有效证据</span></div>
      </div>
      <section>
        <div className="atlas-focus-section-title"><Sparkles aria-hidden="true" /><span>关联公司</span><small>按证据优先 · {companies.length} 家</small></div>
        <div className="atlas-focus-company-list">
          {companies.length > 0 ? companies.map(({ company, edge }) => (
              <button key={company.stockCode} type="button" onClick={() => onSelectCompany(company.stockCode)}>
                <span><b>{company.label}</b><small>{company.stockCode} · {edge.relationType}</small></span>
                <em className={edge.evidenceCount > 0 ? "is-evidenced" : "is-pending"}>{edge.evidenceCount > 0 ? `${edge.evidenceCount} 证据` : "待核验"}</em>
                <ChevronRight aria-hidden="true" />
              </button>
            )) : (
              <div className="atlas-focus-empty">
                <Building2 aria-hidden="true" />
                <b>暂无直接关联公司</b>
                <span>这是产业分类节点，可在“自定义分类”中添加公司标的。</span>
              </div>
            )}
        </div>
      </section>
      <div className="atlas-focus-hint"><MousePointer2 aria-hidden="true" /><span><b>查看公司星图</b><small>点击上方公司，展开业务、上下游与竞争关系</small></span></div>
      {/* LEGACY（按产品要求隐藏）：原“进入赛道研究”主操作。 */}
    </aside>
  );
}

function collectCategoryIds(graph: IndustryGraphPayload, rootId: number) {
  const ids = new Set<number>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    graph.nodes.forEach((node) => {
      if (node.kind !== "category" || node.parentId === null || !ids.has(node.parentId) || ids.has(node.categoryId)) return;
      ids.add(node.categoryId);
      changed = true;
    });
  }
  return ids;
}
