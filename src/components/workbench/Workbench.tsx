"use client";

import { useEffect, useState } from "react";
import { ClassificationTree } from "./ClassificationTree";
import { CompanyDetails } from "./CompanyDetails";
import { ImportDialog } from "./ImportDialog";
import { QualityPanel } from "./QualityPanel";
import { StockTable } from "./StockTable";
import { WorkbenchToolbar } from "./WorkbenchToolbar";

export function Workbench() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedStockCode, setSelectedStockCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setSelectedStockCode(null);
  }, [selectedCategoryId]);

  const refresh = () => setRefreshKey((value) => value + 1);

  return (
    <main className="min-h-screen bg-[#f4f6f9] p-5 text-ink">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">A 股产业链分类工作台</h1>
          <p className="mt-1 text-sm text-muted">按产业链细分方向快速找到 A 股标的，并沉淀证据和研究备注。</p>
        </div>
        <div className="rounded border border-line bg-white px-3 py-2 text-xs text-muted">本地 SQLite · 半导体样板库</div>
      </div>

      <div className="grid min-h-[720px] grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(520px,1fr)_420px]">
        <aside className="min-h-[560px] rounded-lg border border-line bg-white p-4">
          <ClassificationTree
            selectedCategoryId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
            onClearSelection={() => setSelectedCategoryId(null)}
            onChanged={refresh}
            refreshKey={refreshKey}
          />
        </aside>

        <section className="flex min-w-0 flex-col gap-3">
          <WorkbenchToolbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
          <StockTable
            selectedCategoryId={selectedCategoryId}
            selectedStockCode={selectedStockCode}
            searchQuery={searchQuery}
            onSelectStock={setSelectedStockCode}
            refreshKey={refreshKey}
          />
        </section>

        <aside className="min-h-[560px] rounded-lg border border-line bg-white p-4">
          <CompanyDetails stockCode={selectedStockCode} refreshKey={refreshKey} />
        </aside>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(520px,1fr)_420px]">
        <ImportDialog onImported={refresh} />
        <QualityPanel refreshKey={refreshKey} />
      </div>
    </main>
  );
}
