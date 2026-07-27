"use client";

import { useEffect, useState } from "react";
import { Building2, Check, FolderTree, LoaderCircle, Search } from "lucide-react";
import { ClassificationTree } from "@/components/workbench/ClassificationTree";
import { CONFIDENCE_LEVELS, RELATION_TYPES } from "@/lib/domain/constants";
import type { ConfidenceLevel, GraphRelationDirection, RelationType } from "@/lib/domain/types";
import type { StockLookupProfile } from "@/lib/datasources/stockLookup";

type Props = {
  selectedCategoryId: number | null;
  selectedCategoryName: string;
  onSelect: (id: number) => void;
  onClearSelection: () => void;
  onChanged: () => void;
  refreshKey: number;
  onSelectStock?: (stockCode: string) => void;
};

export function AtlasClassificationManager({ selectedCategoryId, selectedCategoryName, onSelect, onClearSelection, onChanged, refreshKey, onSelectStock }: Props) {
  const [tab, setTab] = useState<"tree" | "stock">("tree");
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<StockLookupProfile | null>(null);
  const [relationType, setRelationType] = useState<RelationType>("主营业务");
  const [confidence, setConfidence] = useState<ConfidenceLevel>("中");
  const [rationale, setRationale] = useState("");
  const [isWatchlist, setIsWatchlist] = useState(false);
  const [direction, setDirection] = useState<GraphRelationDirection>("undirected");
  const [strength, setStrength] = useState(65);
  const [status, setStatus] = useState<"idle" | "searching" | "saving" | "saved">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!profile || !selectedCategoryName) return;
    setRationale(buildRationale(profile, selectedCategoryName));
  }, [profile, selectedCategoryName]);

  const lookupStock = async () => {
    const value = query.trim();
    if (!value) {
      setMessage("请输入股票代码或公司名称");
      return;
    }
    setStatus("searching");
    setMessage("");
    try {
      const response = await fetch(`/api/stocks/lookup?query=${encodeURIComponent(value)}&mode=quick`, { cache: "no-store" });
      const payload = await response.json() as { profile?: StockLookupProfile; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error || "未匹配到 A 股公司");
      setProfile(payload.profile);
      setRationale(buildRationale(payload.profile, selectedCategoryName));
      setStatus("idle");
    } catch (error) {
      setProfile(null);
      setStatus("idle");
      setMessage(error instanceof Error ? error.message : "股票资料查询失败");
    }
  };

  const saveStock = async () => {
    if (!profile || selectedCategoryId === null || !rationale.trim()) return;
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch("/api/relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCode: profile.stockCode,
          shortName: profile.shortName,
          fullName: profile.fullName,
          board: profile.board,
          industry: profile.industry,
          region: profile.region,
          marketCapBand: profile.marketCapBand,
          intro: profile.intro,
          mainBusiness: profile.mainBusiness,
          categoryId: selectedCategoryId,
          relationType,
          confidence,
          rationale: rationale.trim(),
          isWatchlist,
          direction,
          strength,
          observedAt: new Date().toISOString(),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "保存标的失败");
      setStatus("saved");
      setMessage(`${profile.shortName}已加入「${selectedCategoryName}」`);
      onChanged();
      onSelectStock?.(profile.stockCode);
    } catch (error) {
      setStatus("idle");
      setMessage(error instanceof Error ? error.message : "保存标的失败");
    }
  };

  return (
    <div className="atlas-classification-manager">
      <div className="atlas-classification-tabs" role="tablist" aria-label="自定义产业链操作">
        <button type="button" className={tab === "tree" ? "is-active" : ""} onClick={() => setTab("tree")}><FolderTree aria-hidden="true" />分类结构</button>
        <button type="button" className={tab === "stock" ? "is-active" : ""} onClick={() => setTab("stock")}><Building2 aria-hidden="true" />添加公司标的</button>
      </div>

      {tab === "tree" ? (
        <div className="atlas-classification-tree-pane">
          <ClassificationTree
            selectedCategoryId={selectedCategoryId}
            onSelect={onSelect}
            onClearSelection={onClearSelection}
            onChanged={onChanged}
            refreshKey={refreshKey}
            onAddStock={(categoryId) => {
              onSelect(categoryId);
              setProfile(null);
              setQuery("");
              setMessage("");
              setStatus("idle");
              setTab("stock");
            }}
          />
        </div>
      ) : (
        <div className="atlas-stock-binder">
          <section className="atlas-stock-target">
            <small>目标分类</small>
            <strong>{selectedCategoryId === null ? "尚未选择分类" : selectedCategoryName}</strong>
            <span>{selectedCategoryId === null ? "先返回分类结构，选择要挂载公司的节点" : "将生成带股票代码的公司节点，不会创建新的分类节点"}</span>
          </section>

          <label className="atlas-stock-search">
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void lookupStock(); }} placeholder="输入 600030 或 中信证券" />
            <button type="button" onClick={() => void lookupStock()} disabled={status === "searching"}>{status === "searching" ? <LoaderCircle className="atlas-spin" aria-hidden="true" /> : "识别"}</button>
          </label>

          {profile ? (
            <div className="atlas-stock-profile">
              <header><div><b>{profile.shortName}</b><span>{profile.stockCode}</span></div><em>{profile.source === "local_index" ? "本地索引" : "数据源"}</em></header>
              <div className="atlas-stock-chips">{[profile.board, profile.industry, profile.region, profile.marketCapBand].filter(Boolean).map((item) => <span key={item}>{item}</span>)}</div>
              <p>{profile.intro || profile.mainBusiness || "基础资料已匹配，详细资料可在保存后后台补全。"}</p>
            </div>
          ) : <div className="atlas-stock-empty"><Building2 aria-hidden="true" /><b>输入代码或公司名即可添加</b><span>代码、简称、板块与基础行业会自动识别</span></div>}

          <div className="atlas-stock-relation-fields">
            <label><span>关系</span><select value={relationType} onChange={(event) => setRelationType(event.target.value as RelationType)}>{RELATION_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>置信度</span><select value={confidence} onChange={(event) => setConfidence(event.target.value as ConfidenceLevel)}>{CONFIDENCE_LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>方向</span><select value={direction} onChange={(event) => setDirection(event.target.value as GraphRelationDirection)}><option value="undirected">关联</option><option value="inbound">上游 → 公司</option><option value="outbound">公司 → 下游</option><option value="bidirectional">双向</option></select></label>
            <label><span>强度 {strength}</span><input type="range" min="0" max="100" step="5" value={strength} onChange={(event) => setStrength(Number(event.target.value))} /></label>
          </div>
          <label className="atlas-stock-rationale"><span>归类说明</span><textarea value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="识别公司后自动生成，可按研究判断修改" /></label>
          <label className="atlas-stock-watch"><input type="checkbox" checked={isWatchlist} onChange={(event) => setIsWatchlist(event.target.checked)} />加入重点跟踪</label>

          {message ? <p className={`atlas-stock-message ${status === "saved" ? "is-success" : ""}`}>{status === "saved" ? <Check aria-hidden="true" /> : null}{message}</p> : null}
          <button className="atlas-stock-save" type="button" onClick={() => void saveStock()} disabled={!profile || selectedCategoryId === null || !rationale.trim() || status === "saving"}>
            {status === "saving" ? <LoaderCircle className="atlas-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}保存并加入星图
          </button>
        </div>
      )}
    </div>
  );
}

function buildRationale(profile: StockLookupProfile, categoryName: string) {
  const business = profile.mainBusiness || profile.industry || "相关业务";
  return `纳入「${categoryName || "当前分类"}」：${profile.shortName}主营${business}，关系待结合公告、年报与研报进一步核验。`;
}
