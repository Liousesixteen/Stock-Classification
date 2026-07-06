"use client";

import { Check, Plus, Trash2, X } from "lucide-react";
import { type FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { CONFIDENCE_LEVELS, RELATION_TYPES } from "@/lib/domain/constants";

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
  refreshKey: number;
};

type DraftStock = {
  stockCode: string;
  shortName: string;
  relationType: string;
  confidence: string;
  rationale: string;
  isWatchlist: boolean;
};

const emptyDraftStock: DraftStock = {
  stockCode: "",
  shortName: "",
  relationType: "主营业务",
  confidence: "中",
  rationale: "",
  isWatchlist: false,
};

export function StockTable({
  selectedCategoryId,
  selectedStockCode,
  searchQuery,
  onSelectStock,
  onClearStock,
  onChanged,
  refreshKey,
}: StockTableProps) {
  const [data, setData] = useState<WorkbenchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [draftStock, setDraftStock] = useState<DraftStock>(emptyDraftStock);
  const [formError, setFormError] = useState("");

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

  const updateDraft = (patch: Partial<DraftStock>) => {
    setDraftStock((current) => ({ ...current, ...patch }));
    setFormError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const categoryId = data?.selectedCategory.id ?? selectedCategoryId;
    if (!categoryId) {
      setFormError("请先选择一个分类");
      return;
    }

    const payload = {
      ...draftStock,
      stockCode: draftStock.stockCode.trim(),
      shortName: draftStock.shortName.trim(),
      rationale: draftStock.rationale.trim(),
      categoryId,
    };

    if (!payload.stockCode || !payload.shortName || !payload.rationale) {
      setFormError("股票代码、公司简称和归类说明都要填写");
      return;
    }

    const response = await fetch("/api/relations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setFormError(result.error ?? "保存标的失败");
      return;
    }

    setIsAdding(false);
    setDraftStock(emptyDraftStock);
    onSelectStock(payload.stockCode);
    onChanged();
  };

  const handleDeleteRelation = async (row: RelationRow) => {
    const confirmed = window.confirm(`从当前分类移除「${row.shortName}」？公司资料会保留。`);
    if (!confirmed) return;

    const response = await fetch(`/api/relations/${row.id}`, { method: "DELETE" });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setFormError(result.error ?? "移除标的失败");
      return;
    }

    if (selectedStockCode === row.stockCode) {
      onClearStock();
    }
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

  return (
    <div className="flex min-h-[620px] flex-1 flex-col rounded-lg border border-line bg-white">
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
            }}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-line px-3 text-sm font-semibold text-slate-700 transition hover:border-[#8fbda7] hover:bg-[#eef8f3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAdding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isAdding ? "取消添加" : "添加标的"}
          </button>
        </div>

        {isAdding ? (
          <form onSubmit={handleSubmit} className="mt-3 rounded-md border border-[#cfe2d8] bg-[#f7fbf9] p-3">
            <div className="grid gap-2 md:grid-cols-[110px_minmax(120px,1fr)_120px_90px]">
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                股票代码
                <input
                  value={draftStock.stockCode}
                  onChange={(event) => updateDraft({ stockCode: event.target.value })}
                  className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                公司简称
                <input
                  value={draftStock.shortName}
                  onChange={(event) => updateDraft({ shortName: event.target.value })}
                  className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
                />
              </label>
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
            <label className="mt-2 grid gap-1 text-xs font-semibold text-slate-600">
              归类说明
              <textarea
                value={draftStock.rationale}
                onChange={(event) => updateDraft({ rationale: event.target.value })}
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
                  className="inline-flex h-9 items-center gap-1 rounded-md bg-[#146c4a] px-3 text-sm font-semibold text-white transition hover:bg-[#10583c]"
                >
                  <Check className="h-4 w-4" />
                  保存标的
                </button>
              </div>
            </div>
          </form>
        ) : formError ? (
          <div className="mt-2 text-xs text-rose-600">{formError}</div>
        ) : null}
      </div>

      <div className="grid grid-cols-[86px_112px_minmax(220px,1fr)_92px_72px_96px_44px] border-b border-line bg-panel px-3 py-2 text-xs font-semibold text-slate-600">
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
              className={`grid grid-cols-[86px_112px_minmax(220px,1fr)_92px_72px_96px_44px] items-center border-b border-slate-100 px-3 py-2 text-sm transition ${
                selectedStockCode === row.stockCode ? "bg-[#eaf4ff]" : "hover:bg-slate-50"
              }`}
            >
              <button
                type="button"
                aria-label={`查看 ${row.shortName}`}
                onClick={() => onSelectStock(row.stockCode)}
                className="contents text-left"
              >
                <span className="font-mono text-[13px] text-slate-700">{row.stockCode}</span>
                <span className="font-semibold">{row.shortName}</span>
                <span className="truncate text-slate-700">{row.rationale || row.intro || "暂无说明"}</span>
                <span>{row.relationType}</span>
                <span>{row.confidence}</span>
                <span className="truncate text-muted">{row.sourceTitle || row.sourceType || "未挂证据"}</span>
              </button>
              <button
                type="button"
                aria-label={`移除 ${row.stockCode} 与当前分类的关系`}
                title={`移除 ${row.stockCode} 与当前分类的关系`}
                onClick={() => handleDeleteRelation(row)}
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
