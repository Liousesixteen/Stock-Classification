"use client";

import { Check, Plus, Search, Trash2, X } from "lucide-react";
import { type FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONFIDENCE_LEVELS, RELATION_TYPES } from "@/lib/domain/constants";
import type { StockLookupProfile } from "@/lib/datasources/stockLookup";
import type { ClassificationAgentResult } from "@/lib/agents/classificationAgent";
import type { CompanyResearchProfileInput } from "@/lib/repositories/researchProfiles";
import type { SyncTask } from "@/lib/repositories/syncTasks";
import { enqueueCompanyProfileSync, pollCompanyProfileSync } from "./companySyncClient";
import type { BackgroundSyncStatus } from "./types";

type RelationRow = {
  id: number;
  stockCode: string;
  shortName: string;
  intro: string;
  categoryId: number;
  relationType: string;
  confidence: string;
  rationale: string;
  isWatchlist: boolean;
  sourceType: string | null;
  sourceTitle: string | null;
};

type WorkbenchResponse = {
  selectedCategory: {
    id: number;
    name: string;
    parentId: number | null;
  };
  relations: RelationRow[];
};

type StockTableProps = {
  selectedCategoryId: number | null;
  selectedStockCode: string | null;
  searchQuery: string;
  onSelectStock: (stockCode: string) => void;
  onClearStock: () => void;
  onChanged: () => void;
  onBackgroundSyncStatusChange: (stockCode: string, status: BackgroundSyncStatus | null) => void;
  refreshKey: number;
};

type DraftStock = {
  lookupQuery: string;
  stockCode: string;
  shortName: string;
  fullName: string;
  board: string;
  industry: string;
  region: string;
  marketCapBand: string;
  intro: string;
  mainBusiness: string;
  concepts: string[];
  industryBlocks: string[];
  sourceFacts: string[];
  evidenceSourceType: string;
  evidenceTitle: string;
  evidenceSourceDate: string;
  evidenceUrl: string;
  evidenceExcerpt: string;
  evidenceCredibility: string;
  relationType: string;
  confidence: string;
  rationale: string;
  isWatchlist: boolean;
  researchProfilePatch?: Omit<CompanyResearchProfileInput, "stockCode">;
};

const emptyDraftStock: DraftStock = {
  lookupQuery: "",
  stockCode: "",
  shortName: "",
  fullName: "",
  board: "",
  industry: "",
  region: "",
  marketCapBand: "",
  intro: "",
  mainBusiness: "",
  concepts: [],
  industryBlocks: [],
  sourceFacts: [],
  evidenceSourceType: "网页",
  evidenceTitle: "",
  evidenceSourceDate: "",
  evidenceUrl: "",
  evidenceExcerpt: "",
  evidenceCredibility: "",
  relationType: "主营业务",
  confidence: "中",
  rationale: "",
  isWatchlist: false,
};

type StockAgentResponse = {
  profile?: StockLookupProfile;
  suggestion?: ClassificationAgentResult;
  mode?: "quick" | "full" | "fallback";
  warning?: string;
  error?: string;
};

async function requestAgentClassification(query: string, categoryId: number, mode: "quick" | "full") {
  const response = await fetch(`/api/agents/classify?query=${encodeURIComponent(query)}&categoryId=${categoryId}&mode=${mode}`);
  const result = (await response.json().catch(() => ({}))) as StockAgentResponse;
  return { response, result };
}

function mergeAgentResultIntoDraft(
  current: DraftStock,
  profile: StockLookupProfile,
  suggestion: ClassificationAgentResult | undefined,
  hasTouchedRationale: boolean,
  options: { applySuggestion?: boolean } = {},
): DraftStock {
  const shouldApplySuggestion = options.applySuggestion ?? true;
  const patch = suggestion?.companyProfilePatch;
  const evidence = suggestion?.evidence;

  return {
    ...current,
    lookupQuery: current.lookupQuery || profile.shortName || profile.stockCode,
    stockCode: profile.stockCode,
    shortName: profile.shortName || current.shortName,
    fullName: firstNonEmpty(patch?.fullName, profile.fullName, current.fullName),
    board: firstNonEmpty(patch?.board, profile.board),
    industry: firstNonEmpty(patch?.industry, profile.industry),
    region: firstNonEmpty(patch?.region, profile.region),
    marketCapBand: firstNonEmpty(patch?.marketCapBand, profile.marketCapBand),
    intro: firstNonEmpty(patch?.intro, profile.intro),
    mainBusiness: firstNonEmpty(patch?.mainBusiness, profile.mainBusiness),
    concepts: profile.concepts,
    industryBlocks: profile.industryBlocks,
    sourceFacts: suggestion?.sourceFacts ?? profile.sourceFacts,
    evidenceSourceType: shouldApplySuggestion ? (evidence?.sourceType ?? current.evidenceSourceType) : current.evidenceSourceType,
    evidenceTitle: shouldApplySuggestion ? (evidence?.title ?? current.evidenceTitle) : current.evidenceTitle,
    evidenceSourceDate: shouldApplySuggestion ? (evidence?.sourceDate ?? current.evidenceSourceDate) : current.evidenceSourceDate,
    evidenceUrl: shouldApplySuggestion ? (evidence?.url ?? current.evidenceUrl) : current.evidenceUrl,
    evidenceExcerpt: shouldApplySuggestion ? (evidence?.excerpt ?? current.evidenceExcerpt) : current.evidenceExcerpt,
    evidenceCredibility: shouldApplySuggestion ? (evidence?.credibility ?? current.evidenceCredibility) : current.evidenceCredibility,
    relationType: shouldApplySuggestion ? (suggestion?.relationType ?? current.relationType) : current.relationType,
    confidence: shouldApplySuggestion ? (suggestion?.confidence ?? current.confidence) : current.confidence,
    rationale: hasTouchedRationale || !shouldApplySuggestion ? current.rationale : (suggestion?.rationale ?? current.rationale),
    researchProfilePatch: shouldApplySuggestion ? (suggestion?.researchProfilePatch ?? current.researchProfilePatch) : current.researchProfilePatch,
  };
}

function buildEvidencePayload(draft: DraftStock) {
  if (!draft.evidenceTitle.trim() && !draft.evidenceExcerpt.trim() && !draft.evidenceUrl.trim()) return undefined;

  return {
    sourceType: draft.evidenceSourceType || "网页",
    title: draft.evidenceTitle.trim(),
    sourceDate: draft.evidenceSourceDate.trim(),
    url: draft.evidenceUrl.trim(),
    excerpt: draft.evidenceExcerpt.trim(),
    credibility: draft.evidenceCredibility || draft.confidence,
    isExpired: false,
  };
}

function buildFallbackRationale(draft: DraftStock, categoryName: string) {
  const descriptor = [draft.industry, draft.board].filter(Boolean).join(" / ");
  return `纳入「${categoryName}」：${draft.shortName}${descriptor ? `（${descriptor}）` : ""}，已先保存基础资料，完整 F10 与 Agent 证据将后台同步。`;
}

function buildRelationPayload(draft: DraftStock, categoryId: number, categoryName: string) {
  const rationale = draft.rationale.trim() || buildFallbackRationale(draft, categoryName);

  return {
    ...draft,
    stockCode: draft.stockCode.trim(),
    shortName: draft.shortName.trim(),
    fullName: draft.fullName.trim(),
    board: draft.board.trim(),
    industry: draft.industry.trim(),
    region: draft.region.trim(),
    marketCapBand: draft.marketCapBand.trim(),
    intro: draft.intro.trim(),
    mainBusiness: draft.mainBusiness.trim(),
    rationale,
    categoryId,
    evidence: buildEvidencePayload({ ...draft, rationale }),
    researchProfilePatch: draft.researchProfilePatch,
  };
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim()) ?? "";
}

function relationKey(stockCode: string, categoryId: number) {
  return `${categoryId}:${stockCode}`;
}

export function StockTable({
  selectedCategoryId,
  selectedStockCode,
  searchQuery,
  onSelectStock,
  onClearStock,
  onChanged,
  onBackgroundSyncStatusChange,
  refreshKey,
}: StockTableProps) {
  const [data, setData] = useState<WorkbenchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftStock, setDraftStock] = useState<DraftStock>(emptyDraftStock);
  const [formError, setFormError] = useState("");
  const [lookupMessage, setLookupMessage] = useState("");
  const [hasTouchedRationale, setHasTouchedRationale] = useState(false);
  const lookupRequestIdRef = useRef(0);
  const deletedRelationKeysRef = useRef(new Set<string>());

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    const query = selectedCategoryId ? `?categoryId=${selectedCategoryId}` : "";
    fetch(`/api/workbench${query}`)
      .then((response) => response.json() as Promise<WorkbenchResponse>)
      .then((payload) => {
        if (isMounted) setData(payload);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshKey, selectedCategoryId]);

  const updateDraft = (patch: Partial<DraftStock>, options: { clearLookupMessage?: boolean } = {}) => {
    setDraftStock((current) => ({ ...current, ...patch }));
    setFormError("");
    if (options.clearLookupMessage ?? true) {
      setLookupMessage("");
    }
  };

  const applyAgentResult = useCallback((profile: StockLookupProfile, suggestion?: ClassificationAgentResult, resultMode: StockAgentResponse["mode"] = "full", warning = "") => {
    const isQuick = resultMode === "quick";
    setDraftStock((current) => mergeAgentResultIntoDraft(current, profile, suggestion, hasTouchedRationale, { applySuggestion: !isQuick }));
    if (isQuick) {
      setLookupMessage("已快速匹配 · 正在补充 F10 与 Agent 资料");
      return;
    }
    setLookupMessage(warning ? `已降级整理 · ${warning}` : `Agent 已整理 · ${suggestion?.agentName ?? profile.sourceDetail}`);
  }, [hasTouchedRationale]);

  const lookupDraft = useCallback(async (rawQuery: string, options: { mode?: "quick" | "full" } = {}) => {
    const mode = options.mode ?? "full";
    const query = rawQuery.trim();
    if (!query) {
      setFormError("先输入股票代码或名称");
      return undefined;
    }

    const requestId = ++lookupRequestIdRef.current;
    setIsLookingUp(true);
    setFormError("");

    try {
      const categoryId = data?.selectedCategory.id ?? selectedCategoryId;
      if (!categoryId) {
        setFormError("请先选择一个分类");
        return undefined;
      }

      const { response, result } = await requestAgentClassification(query, categoryId, mode);
      if (!response.ok || !result.profile) {
        if (requestId !== lookupRequestIdRef.current) return undefined;
        setFormError(result.error ?? "没有匹配到股票，请输入更完整的代码或名称");
        return undefined;
      }

      if (requestId !== lookupRequestIdRef.current) return result;
      applyAgentResult(result.profile, result.suggestion, result.mode ?? mode, result.warning);
      return result;
    } finally {
      if (requestId === lookupRequestIdRef.current) {
        setIsLookingUp(false);
      }
    }
  }, [applyAgentResult, data?.selectedCategory.id, selectedCategoryId]);

  const enrichSavedRelation = useCallback(async (stockCode: string, categoryId: number, initialTask?: SyncTask) => {
    const syncMessage = "F10、概念板块与 Agent 证据正在后台补全";
    onBackgroundSyncStatusChange(stockCode, { state: "syncing", message: syncMessage });

    try {
      const queuedTask = initialTask ?? await enqueueCompanyProfileSync(stockCode, { categoryId });
      const task = await pollCompanyProfileSync(stockCode, queuedTask.id);
      if (deletedRelationKeysRef.current.has(relationKey(stockCode, categoryId))) {
        onBackgroundSyncStatusChange(stockCode, null);
        return;
      }
      if (task?.status === "success") {
        const message = task.message || "后台资料已补全并写入结构化资料";
        onBackgroundSyncStatusChange(stockCode, { state: "done", message });
        onChanged();
      } else if (task?.status === "failed") {
        const message = task.error || task.message || "后台补全失败，可稍后重试";
        onBackgroundSyncStatusChange(stockCode, { state: "failed", message });
      } else {
        onBackgroundSyncStatusChange(stockCode, {
          state: "syncing",
          message: "后台仍在补全，可继续使用其他功能",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "后台补全异常，可点击同步资料重试";
      onBackgroundSyncStatusChange(stockCode, { state: "failed", message });
    }
  }, [onBackgroundSyncStatusChange, onChanged]);

  useEffect(() => {
    if (!isAdding) return;
    const query = draftStock.lookupQuery.trim();
    if (query.length < 2) return;

    const quickTimeoutId = window.setTimeout(() => {
      void lookupDraft(query, { mode: "quick" });
    }, 120);

    return () => {
      window.clearTimeout(quickTimeoutId);
    };
  }, [draftStock.lookupQuery, isAdding, lookupDraft]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const categoryId = data?.selectedCategory.id ?? selectedCategoryId;
    const categoryName = data?.selectedCategory.name ?? "当前分类";
    if (!categoryId) {
      setFormError("请先选择一个分类");
      return;
    }
    if (isSaving) return;

    setIsSaving(true);
    setFormError("");

    try {
      let nextDraft = draftStock;
      if (!nextDraft.stockCode || !nextDraft.shortName) {
        const query = nextDraft.lookupQuery.trim();
        if (!query) {
          setFormError("先输入股票代码或名称");
          return;
        }
        const { response, result } = await requestAgentClassification(query, categoryId, "quick");
        if (!response.ok || !result.profile) {
          setFormError(result.error ?? "没有匹配到股票，请输入更完整的代码或名称");
          return;
        }
        nextDraft = mergeAgentResultIntoDraft(nextDraft, result.profile, result.suggestion, hasTouchedRationale, { applySuggestion: false });
      }

      const payload = buildRelationPayload(nextDraft, categoryId, categoryName);

      if (!payload.stockCode || !payload.shortName || !payload.rationale) {
        setFormError("请输入能匹配到 A 股的代码或名称");
        return;
      }

      deletedRelationKeysRef.current.delete(relationKey(payload.stockCode, categoryId));
      const response = await fetch("/api/relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; task?: SyncTask };
      if (!response.ok) {
        setFormError(result.error ?? "保存标的失败");
        return;
      }

      lookupRequestIdRef.current += 1;
      setIsAdding(false);
      setDraftStock(emptyDraftStock);
      setHasTouchedRationale(false);
      setLookupMessage("");
      setIsLookingUp(false);
      onSelectStock(payload.stockCode);
      onChanged();

      void enrichSavedRelation(payload.stockCode, categoryId, result.task);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "保存标的失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRelation = async (row: RelationRow) => {
    const confirmed = window.confirm(`从当前分类移除「${row.shortName}」？公司资料会保留。`);
    if (!confirmed) return;

    const key = relationKey(row.stockCode, row.categoryId);
    deletedRelationKeysRef.current.add(key);
    const response = await fetch(`/api/relations/${row.id}`, { method: "DELETE" });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      deletedRelationKeysRef.current.delete(key);
      setFormError(result.error ?? "移除标的失败");
      return;
    }

    if (selectedStockCode === row.stockCode) {
      onClearStock();
    }
    onBackgroundSyncStatusChange(row.stockCode, null);
    onChanged();
  };

  const rows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return data?.relations ?? [];

    return (data?.relations ?? []).filter((row) =>
      [row.stockCode, row.shortName, row.rationale, row.relationType, row.confidence, row.sourceTitle ?? "", row.sourceType ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [data?.relations, searchQuery]);

  const profileChips = [
    draftStock.board,
    draftStock.industry,
    draftStock.region,
    draftStock.marketCapBand,
    ...draftStock.concepts.slice(0, 5),
  ].filter(Boolean);

  return (
    <div className="future-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-line p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase text-muted">当前细分方向</div>
            <h2 className="mt-1 text-lg font-semibold">{data?.selectedCategory.name ?? "加载中..."}</h2>
            <p className="mt-2 text-xs text-muted">按关系类型、确信度和来源识别“真主营”与“概念相关”。</p>
          </div>
            <button
              type="button"
              disabled={!data?.selectedCategory}
              onClick={() => {
                setIsAdding((value) => !value);
              setFormError("");
                setLookupMessage("");
                setHasTouchedRationale(false);
              }}
              className="action-button inline-flex h-9 shrink-0 items-center gap-1 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
            {isAdding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isAdding ? "取消添加" : "添加标的"}
          </button>
        </div>

        {isAdding ? (
          <form onSubmit={handleSubmit} className="mt-3 rounded-md border border-[#cfe2d8] bg-[#f7fbf9] p-3">
            <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_120px_90px]">
              <div className="grid gap-1 text-xs font-semibold text-slate-600">
                <label htmlFor="stock-query-input">股票代码或名称</label>
                <div className="relative">
                  <Search className={`pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 ${isLookingUp ? "animate-pulse" : ""}`} />
                  <input
                    id="stock-query-input"
                    value={draftStock.lookupQuery}
                    onChange={(event) => {
                      setHasTouchedRationale(false);
                      updateDraft({
                        ...emptyDraftStock,
                        lookupQuery: event.target.value,
                        relationType: draftStock.relationType,
                        confidence: draftStock.confidence,
                        isWatchlist: draftStock.isWatchlist,
                      });
                    }}
                    placeholder="输入 600030 或 中信证券"
                    className="h-9 w-full rounded border border-line bg-white pl-8 pr-2 text-sm font-normal outline-none focus:border-[#73b99a]"
                  />
                </div>
              </div>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                关系
                <select
                  value={draftStock.relationType}
                  onChange={(event) => updateDraft({ relationType: event.target.value })}
                  className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
                >
                  {RELATION_TYPES.map((relationType) => (
                    <option key={relationType} value={relationType}>
                      {relationType}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                确信度
                <select
                  value={draftStock.confidence}
                  onChange={(event) => updateDraft({ confidence: event.target.value })}
                  className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
                >
                  {CONFIDENCE_LEVELS.map((confidence) => (
                    <option key={confidence} value={confidence}>
                      {confidence}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {profileChips.length > 0 || lookupMessage ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {draftStock.stockCode ? (
                  <span className="rounded-full border border-[#d7dde8] bg-white px-2 py-1 font-mono font-medium text-slate-700">
                    {draftStock.stockCode}
                  </span>
                ) : null}
                {draftStock.shortName ? (
                  <span className="rounded-full border border-[#d7dde8] bg-white px-2 py-1 font-medium text-slate-700">
                    {draftStock.shortName}
                  </span>
                ) : null}
                {profileChips.map((chip) => (
                  <span key={chip} className="rounded-full border border-[#c8ded4] bg-white px-2 py-1 font-medium text-[#24694d]">
                    {chip}
                  </span>
                ))}
                {lookupMessage ? <span className="text-muted">{lookupMessage}</span> : null}
              </div>
            ) : null}
            <label className="mt-2 grid gap-1 text-xs font-semibold text-slate-600">
              归类说明
              <textarea
                value={draftStock.rationale}
                onChange={(event) => {
                  setHasTouchedRationale(true);
                  updateDraft({ rationale: event.target.value }, { clearLookupMessage: false });
                }}
                rows={2}
                className="resize-none rounded border border-line bg-white px-2 py-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={draftStock.isWatchlist}
                  onChange={(event) => updateDraft({ isWatchlist: event.target.checked })}
                  className="h-4 w-4 accent-[#2f8d67]"
                />
                标记为待复核
              </label>
              <div className="flex items-center gap-2">
                {formError ? <span className="text-xs text-rose-600">{formError}</span> : null}
                <button
                  type="submit"
                  disabled={isSaving}
                  className="action-button-primary inline-flex h-9 items-center gap-1 px-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
                >
                  <Check className="h-4 w-4" />
                  {isSaving ? "保存中" : "保存标的"}
                </button>
              </div>
            </div>
          </form>
        ) : formError ? (
          <div className="mt-2 text-xs text-rose-600">{formError}</div>
        ) : null}
      </div>

      <div className="grid grid-cols-[78px_104px_minmax(0,1fr)_84px_68px_88px_36px] border-b border-line bg-panel px-3 py-2 text-xs font-semibold text-slate-600">
        <div>代码</div>
        <div>公司</div>
        <div>归类说明</div>
        <div>关系</div>
        <div>确信度</div>
        <div>来源</div>
        <div />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 text-sm text-muted">加载标的中...</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-muted">当前分类下暂无标的，可先通过下方导入面板导入 Excel/CSV。</div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              aria-label={`查看 ${row.shortName}`}
              onClick={() => onSelectStock(row.stockCode)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectStock(row.stockCode);
                }
              }}
              className={`grid min-w-0 grid-cols-[78px_104px_minmax(0,1fr)_84px_68px_88px_36px] items-center border-b border-slate-100 px-3 py-2 text-sm transition ${
                selectedStockCode === row.stockCode ? "bg-[#eaf4ff]" : "hover:bg-slate-50"
              }`}
            >
              <span className="min-w-0 truncate font-mono text-[13px] text-slate-700">{row.stockCode}</span>
              <span className="min-w-0 truncate font-semibold">{row.shortName}</span>
              <span className="min-w-0 truncate text-slate-700">{row.rationale || row.intro || "暂无说明"}</span>
              <span className="min-w-0 truncate">{row.relationType}</span>
              <span className="min-w-0 truncate">{row.confidence}</span>
              <span className="min-w-0 truncate text-muted">{row.sourceTitle || row.sourceType || "未挂证据"}</span>
              <button
                type="button"
                aria-label={`移除 ${row.stockCode} 与当前分类的关系`}
                title={`移除 ${row.stockCode} 与当前分类的关系`}
                onClick={(event) => {
                  event.stopPropagation();
                  handleDeleteRelation(row);
                }}
                className="grid h-8 w-8 place-items-center rounded text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
