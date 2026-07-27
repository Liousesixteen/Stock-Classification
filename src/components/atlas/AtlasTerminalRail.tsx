"use client";

import { Activity, ArrowUpRight, CircleDot, Database, Radar } from "lucide-react";
import type { IndustryGraphNode } from "@/lib/industry-graph/types";

type CompanyNode = Extract<IndustryGraphNode, { kind: "company" }>;

export function AtlasTerminalRail({
  nodes,
  onSelectCompany,
}: {
  nodes: IndustryGraphNode[];
  onSelectCompany: (stockCode: string) => void;
}) {
  const companies = nodes.filter((node): node is CompanyNode => node.kind === "company");
  const priority = [...companies].sort((left, right) => right.evidenceCount - left.evidenceCount || confidenceWeight(right.confidence) - confidenceWeight(left.confidence)).slice(0, 10);
  const verified = companies.filter((company) => company.evidenceCount > 0 && company.confidence !== "低").length;

  return (
    <aside className="atlas-terminal-rail" aria-label="研究信号与标的列表">
      <div className="terminal-rail-head">
        <div><span>MARKET SIGNALS</span><h2>研究焦点</h2></div>
        <Radar aria-hidden="true" />
      </div>
      <div className="terminal-rail-strip">
        <div><b>{companies.length}</b><span>覆盖标的</span></div>
        <div><b>{verified}</b><span>已证实</span></div>
        <div><b>{nodes.filter((node) => node.kind === "category").length}</b><span>产业节点</span></div>
      </div>
      <div className="terminal-rail-label"><Activity aria-hidden="true" />优先追踪</div>
      <div className="terminal-watch-list">
        {priority.map((company) => (
          <button key={company.id} type="button" onClick={() => onSelectCompany(company.stockCode)}>
            <span className={`terminal-signal is-${company.confidence}`}>{company.confidence}</span>
            <span className="terminal-company"><b>{company.label}</b><small>{company.stockCode} · {company.relationType}</small></span>
            <span className="terminal-evidence"><CircleDot aria-hidden="true" />{company.evidenceCount}</span>
          </button>
        ))}
      </div>
      <div className="terminal-rail-foot"><Database aria-hidden="true" />本地结构化资料已连接<ArrowUpRight aria-hidden="true" /></div>
    </aside>
  );
}

function confidenceWeight(confidence: CompanyNode["confidence"]) {
  return confidence === "高" ? 3 : confidence === "中" ? 2 : 1;
}
