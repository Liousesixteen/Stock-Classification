"use client";

import { useEffect, useMemo, useState } from "react";

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
  refreshKey: number;
};

export function StockTable({ selectedCategoryId, selectedStockCode, searchQuery, onSelectStock, refreshKey }: StockTableProps) {
  const [data, setData] = useState<WorkbenchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        <div className="text-xs font-semibold uppercase text-muted">当前细分方向</div>
        <h2 className="mt-1 text-lg font-semibold">{data?.selectedCategory.name ?? "加载中..."}</h2>
        <p className="mt-2 text-xs text-muted">按关系类型、确信度和来源识别“真主营”与“概念相关”。</p>
      </div>

      <div className="grid grid-cols-[86px_112px_minmax(220px,1fr)_92px_72px_96px] border-b border-line bg-panel px-3 py-2 text-xs font-semibold text-slate-600">
        <div>代码</div>
        <div>公司</div>
        <div>归类说明</div>
        <div>关系</div>
        <div>确信度</div>
        <div>来源</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 text-sm text-muted">加载标的中...</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-muted">当前分类下暂无标的，可先通过下方导入面板导入 Excel/CSV。</div>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelectStock(row.stockCode)}
              className={`grid w-full grid-cols-[86px_112px_minmax(220px,1fr)_92px_72px_96px] border-b border-slate-100 px-3 py-3 text-left text-sm transition ${
                selectedStockCode === row.stockCode ? "bg-[#eaf4ff]" : "hover:bg-slate-50"
              }`}
            >
              <span className="font-mono text-[13px] text-slate-700">{row.stockCode}</span>
              <span className="font-semibold">{row.shortName}</span>
              <span className="truncate text-slate-700">{row.rationale || row.intro || "暂无说明"}</span>
              <span>{row.relationType}</span>
              <span>{row.confidence}</span>
              <span className="truncate text-muted">{row.sourceTitle || row.sourceType || "未挂证据"}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
