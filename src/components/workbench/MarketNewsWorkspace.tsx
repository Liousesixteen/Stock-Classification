"use client";

import { ArrowUpRight, Building2, CalendarDays, FileCheck2, Filter, Newspaper, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { IndustryGraphNode, IndustryGraphPayload } from "@/lib/industry-graph/types";

type NewsFilter = "全部" | "公司公告" | "机构研报" | "行业资讯";

export function MarketNewsWorkspace({ onOpenCompany }: { onOpenCompany: (stockCode: string, categoryId: number | null) => void }) {
  const [graph, setGraph] = useState<IndustryGraphPayload | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NewsFilter>("全部");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/industry-graph", { signal: controller.signal, cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<IndustryGraphPayload> : Promise.reject(new Error("news unavailable")))
      .then(setGraph)
      .catch(() => setGraph(null));
    return () => controller.abort();
  }, []);

  const rows = useMemo(() => {
    if (!graph) return [];
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const companyByEntity = new Map<string, Extract<IndustryGraphNode, { kind: "company" }>>();
    graph.edges.forEach((edge) => {
      if (edge.kind !== "entityRelation") return;
      const company = nodeById.get(edge.source);
      if (company?.kind === "company" && !companyByEntity.has(edge.target)) companyByEntity.set(edge.target, company);
    });
    return graph.nodes
      .filter((node): node is Extract<IndustryGraphNode, { kind: "evidence" }> => node.kind === "evidence")
      .map((node) => {
        const owner = nodeById.get(node.ownerNodeId);
        const company = owner?.kind === "company" ? owner : companyByEntity.get(node.ownerNodeId);
        return { node, company, channel: newsChannel(node.sourceType) };
      })
      .filter((row) => filter === "全部" || row.channel === filter)
      .filter((row) => !query.trim() || `${row.node.label} ${row.node.excerpt} ${row.company?.label ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((left, right) => right.node.sourceDate.localeCompare(left.node.sourceDate));
  }, [filter, graph, query]);

  return (
    <section className="market-news-workspace">
      <header className="news-workspace-hero">
        <div><span><Newspaper aria-hidden="true" />EVIDENCE NEWSROOM</span><h2>资讯</h2><p>汇总产业链中的公告、研报与行业证据；所有内容均可回溯到本地资料来源。</p></div>
        <div className="news-hero-metrics"><article><b>{graph?.stats.evidenceCount ?? "—"}</b><span>有效资讯</span></article><article><b>{graph?.stats.companyCount ?? "—"}</b><span>覆盖公司</span></article><article><b>{graph?.stats.verifiedRelationCount ?? "—"}</b><span>已核验关系</span></article></div>
      </header>
      <div className="news-toolbar">
        <label><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、主题或证据摘要" /></label>
        <nav aria-label="资讯类型"><Filter aria-hidden="true" />{(["全部", "公司公告", "机构研报", "行业资讯"] as NewsFilter[]).map((item) => <button type="button" key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</nav>
      </div>
      <div className="news-content-grid">
        <main className="news-feed">
          {rows.length ? rows.map(({ node, company, channel }) => <article key={node.id}>
            <div className="news-date"><CalendarDays aria-hidden="true" /><span>{node.sourceDate || "日期待补"}</span><em>{channel}</em></div>
            <div className="news-card-body"><span className="news-source"><FileCheck2 aria-hidden="true" />{node.sourceType}<i className={node.verificationStatus === "verified" ? "is-verified" : ""}>{node.verificationStatus === "verified" ? "已核验" : "待复核"}</i></span><h3>{node.label}</h3><p>{node.excerpt || "该条资料已进入产业链证据库，摘要待补充。"}</p><footer>{company ? <button type="button" onClick={() => onOpenCompany(company.stockCode, null)}><Building2 aria-hidden="true" />{company.label}<ArrowUpRight aria-hidden="true" /></button> : <span>产业级资料</span>}{node.url ? <a href={node.url} target="_blank" rel="noreferrer">查看来源<ArrowUpRight aria-hidden="true" /></a> : <small>来源链接待补</small>}</footer></div>
          </article>) : <div className="news-empty"><Newspaper aria-hidden="true" /><b>{graph ? "暂无匹配资讯" : "正在读取证据资讯"}</b><span>调整筛选条件，或在星图中补充新的公开证据。</span></div>}
        </main>
        <aside className="news-trust-panel"><ShieldCheck aria-hidden="true" /><h3>资讯可信边界</h3><p>这里不是实时新闻流。页面仅展示已经进入产业链证据库的资料，避免把未经核验的信息包装成事实。</p><div><span>公司公告</span><b>优先</b></div><div><span>机构研报</span><b>辅助</b></div><div><span>行业资讯</span><b>待交叉验证</b></div></aside>
      </div>
    </section>
  );
}

function newsChannel(sourceType: string): Exclude<NewsFilter, "全部"> {
  if (/公告|年报|季报|交易所/.test(sourceType)) return "公司公告";
  if (/研报|券商|机构/.test(sourceType)) return "机构研报";
  return "行业资讯";
}
