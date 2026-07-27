"use client";

import { ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, CheckCircle2, ChevronRight, CircleAlert, Layers3, Orbit, ShieldCheck, Sparkles } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import type { SectorResearchData } from "@/lib/repositories/sectorResearch";
import { WorkspaceState } from "@/components/workbench/WorkspaceState";

type RelationFilter = "全部" | "主营业务" | "重要相关" | "待验证" | "已关注" | "资料待补";

export function SectorResearch({
  selectedCategoryId,
  refreshKey,
  onSelectCategory,
  onOpenCompany,
  onOpenAtlas,
  onOpenWorkbench,
}: {
  selectedCategoryId: number | null;
  refreshKey: number;
  onSelectCategory: (categoryId: number) => void;
  onOpenCompany: (stockCode: string) => void;
  onOpenAtlas: () => void;
  onOpenWorkbench: () => void;
}) {
  const [data, setData] = useState<SectorResearchData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [filter, setFilter] = useState<RelationFilter>("全部");
  const [reloadKey, setReloadKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setErrorMessage("");
    fetch(`/api/sectors/${selectedCategoryId ?? "default"}?retry=${reloadKey}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("赛道资料暂时不可用");
        return response.json() as Promise<SectorResearchData>;
      })
      .then((payload) => {
        setData(payload);
        setStatus("ready");
        if (selectedCategoryId === null) onSelectCategory(payload.category.id);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setErrorMessage(error instanceof Error ? error.message : "赛道资料暂时不可用");
          setStatus("error");
        }
      });
    return () => controller.abort();
  }, [refreshKey, reloadKey, selectedCategoryId, onSelectCategory]);

  const companies = useMemo(() => {
    if (!data) return [];
    if (filter === "全部") return data.companies;
    if (filter === "已关注") return data.companies.filter((company) => company.isWatchlist);
    if (filter === "资料待补") return data.companies.filter((company) => !company.hasResearchProfile);
    return data.companies.filter((company) => company.relationType === filter);
  }, [data, filter]);

  const toggleWatchlist = async (stockCode: string, relationId: number, isWatchlist: boolean) => {
    const response = await fetch(`/api/relations/${relationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isWatchlist: !isWatchlist }),
    });
    if (!response.ok) return;
    setData((current) => current ? {
      ...current,
      companies: current.companies.map((company) => company.stockCode === stockCode ? { ...company, isWatchlist: !isWatchlist } : company),
    } : current);
  };

  if (status === "loading" && !data) return <section className="sector-research-loading"><WorkspaceState state="loading" title="正在构建赛道研究页" description="汇总公司矩阵、证据覆盖与产业链信号" /></section>;
  if (status === "error" || !data) return <section className="sector-research-loading"><WorkspaceState state="error" title="赛道资料暂时不可用" description={errorMessage} onAction={() => setReloadKey((value) => value + 1)} /></section>;

  const missingEvidence = data.companies.filter((company) => company.evidenceCount === 0).slice(0, 3);
  const missingProfiles = data.companies.filter((company) => !company.hasResearchProfile).slice(0, 3);
  const description = data.category.description || `${data.category.name}位于${data.category.industry || "当前产业链"}，以下公司按关系强度和证据覆盖进行组织。`;

  return (
    <section className="sector-research" data-testid="sector-research">
      <header className="sector-hero">
        <div>
          <p className="sector-eyebrow"><Sparkles aria-hidden="true" />SECTOR INTELLIGENCE / 赛道研究</p>
          <div className="sector-breadcrumbs"><button type="button" onClick={() => onSelectCategory(data.path[0]?.id ?? data.category.id)}>产业链</button>{data.path.map((item) => <span key={item.id}><ChevronRight aria-hidden="true" />{item.name}</span>)}</div>
          <h2>{data.category.name}</h2>
          <p className="sector-description">{description}</p>
        </div>
        <div className="sector-hero-actions">
          <button className="sector-workbench-entry" type="button" onClick={onOpenWorkbench}><ArrowLeft aria-hidden="true" />返回工作台</button>
          <button className="sector-atlas-entry" type="button" onClick={onOpenAtlas}><Orbit aria-hidden="true" />在星图中探索</button>
        </div>
      </header>

      <div className="sector-stat-strip" aria-label="赛道关键指标">
        <Metric value={data.stats.companyCount} label="相关公司" />
        <Metric value={data.stats.categoryCount} label="细分环节" />
        <Metric value={data.stats.evidenceCount} label="有效证据" />
        <Metric value={`${data.stats.profileCoverage}%`} label="研究资料覆盖" />
      </div>

      <div className={`sector-layout ${data.subcategories.length ? "" : "is-leaf"}`}>
        {data.subcategories.length ? <aside className="sector-map">
          <div className="sector-panel-kicker">产业链位置</div>
          <h3>细分方向</h3>
          <button className="sector-node is-active" type="button"><Layers3 aria-hidden="true" /><span>{data.category.name}</span><b>当前</b></button>
          {data.subcategories.map((category) => (
            <button className="sector-node" key={category.id} type="button" onClick={() => onSelectCategory(category.id)}><span>{category.name}</span><b>{category.companyCount} 家</b></button>
          ))}
        </aside> : null}

        <main className="sector-company-matrix">
          <div className="sector-section-heading"><div><p className="sector-panel-kicker">标的矩阵</p><h3>同赛道公司对比</h3></div><div className="sector-filters" aria-label="关系类型筛选">{(["全部", "主营业务", "重要相关", "待验证", "已关注", "资料待补"] as RelationFilter[]).map((item) => <button type="button" key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
          <div className="sector-table-wrap">
            <table>
              <thead><tr><th>公司</th><th>所属环节</th><th>关系</th><th>核心业务 / 研究摘要</th><th>证据</th><th>资料</th><th>跟踪</th><th /></tr></thead>
              <tbody>{companies.map((company) => <tr key={company.stockCode}>
                <td><strong>{company.shortName}</strong><small>{company.stockCode} · {company.board || "A 股"}</small></td>
                <td><div className="sector-tags">{company.categoryNames.slice(0, 2).map((name) => <span key={name}>{name}</span>)}</div></td>
                <td><span className={`relation-badge relation-${relationTone(company.relationType)}`}>{company.relationType}</span><small className="confidence-line">置信度 · {company.confidence}</small></td>
                <td><p className="sector-company-summary">{company.businessLines[0] ? `${company.businessLines[0].name}${company.businessLines[0].share ? ` · ${company.businessLines[0].share}` : ""}` : company.summary || "业务资料待补"}</p></td>
                <td><span className={company.evidenceCount ? "evidence-good" : "evidence-pending"}>{company.evidenceCount ? `${company.evidenceCount} 条` : "待补"}</span></td>
                <td><span className={company.hasResearchProfile ? "profile-ready" : "profile-pending"}>{company.hasResearchProfile ? "已沉淀" : "待补"}</span></td>
                <td><button className={`sector-watch ${company.isWatchlist ? "is-active" : ""}`} type="button" aria-label={`${company.isWatchlist ? "取消关注" : "关注"} ${company.shortName}`} title={`${company.isWatchlist ? "取消关注" : "关注"} ${company.shortName}`} onClick={() => void toggleWatchlist(company.stockCode, company.relationId, company.isWatchlist)}>{company.isWatchlist ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}</button></td>
                <td><button className="sector-open-company" type="button" onClick={() => onOpenCompany(company.stockCode)} title={`查看 ${company.shortName} 研究详情`}><ArrowRight aria-hidden="true" /></button></td>
              </tr>)}</tbody>
            </table>
            {!companies.length ? <p className="sector-empty sector-empty-table">当前筛选下暂无公司</p> : null}
          </div>
        </main>

        <aside className="sector-signals">
          <div className="sector-section-heading"><div><p className="sector-panel-kicker">研究线索</p><h3>证据与待办</h3></div><ShieldCheck aria-hidden="true" /></div>
          <div className="sector-coverage"><div><span>高置信公司</span><b>{data.stats.highConfidenceCount}/{data.stats.companyCount}</b></div><div><span>资料覆盖</span><b>{data.stats.profileCoverage}%</b></div></div>
          <section><h4><CheckCircle2 aria-hidden="true" />已沉淀证据</h4><p>关系证据共 {data.stats.evidenceCount} 条，优先关注主营业务关系的来源完整度。</p></section>
          <section className={missingEvidence.length ? "is-alert" : ""}><h4><CircleAlert aria-hidden="true" />待补证据</h4>{missingEvidence.length ? <div className="sector-missing-list">{missingEvidence.map((company) => <button type="button" onClick={() => onOpenCompany(company.stockCode)} key={company.stockCode}>{company.shortName}<ChevronRight aria-hidden="true" /></button>)}</div> : <p>当前赛道公司均已有至少一条有效证据。</p>}</section>
          <section className={missingProfiles.length ? "is-alert" : ""}><h4><CircleAlert aria-hidden="true" />待补研究档案</h4>{missingProfiles.length ? <div className="sector-missing-list">{missingProfiles.map((company) => <button type="button" onClick={() => onOpenCompany(company.stockCode)} key={company.stockCode}>{company.shortName}<ChevronRight aria-hidden="true" /></button>)}</div> : <p>当前赛道公司均已沉淀结构化研究档案。</p>}</section>
          <section><h4><Sparkles aria-hidden="true" />建议跟踪</h4><p>业务收入占比、毛利率、客户变化、订单与公告证据。</p></section>
        </aside>
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return <div><b>{value}</b><span>{label}</span></div>;
}

function relationTone(relationType: string) {
  if (relationType === "主营业务") return "primary";
  if (relationType === "重要相关") return "related";
  return "pending";
}
