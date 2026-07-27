"use client";

import dynamic from "next/dynamic";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { SectorResearch } from "@/components/sector/SectorResearch";
import { ResearchQueue } from "@/components/queue/ResearchQueue";
import type { WorkbenchMode } from "./types";
import { WorkbenchModeSwitch } from "./WorkbenchModeSwitch";
import { GlobalMarketTicker } from "./GlobalMarketTicker";
import { ResearchWorkbench } from "./ResearchWorkbench";
import { ResearchResultsLibrary } from "./ResearchResultsLibrary";
import type { ResearchQueueItem } from "@/lib/repositories/researchQueue";

const IndustryAtlas = dynamic(() => import("@/components/atlas/IndustryAtlas").then((module) => module.IndustryAtlas), {
  ssr: false,
  loading: () => <div className="atlas-loading" role="status">正在构建产业链星图</div>,
});

export function Workbench() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [sectorCategoryId, setSectorCategoryId] = useState<number | null>(null);
  const [selectedStockCode, setSelectedStockCode] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mode, setMode] = useState<WorkbenchMode>("research");
  const [researchHomeKey, setResearchHomeKey] = useState(0);
  const [pendingCompanySelection, setPendingCompanySelection] = useState<{ stockCode: string; categoryId: number | null } | null>(null);
  const [researchFocusTask, setResearchFocusTask] = useState<ResearchQueueItem | null>(null);

  useEffect(() => {
    setSelectedStockCode(null);
  }, [selectedCategoryId]);

  useEffect(() => {
    if (!pendingCompanySelection || selectedCategoryId !== pendingCompanySelection.categoryId) return;
    setSelectedStockCode(pendingCompanySelection.stockCode);
    setPendingCompanySelection(null);
  }, [pendingCompanySelection, selectedCategoryId]);

  useEffect(() => {
    const storedMode = window.localStorage.getItem("stock-classification:mode");
    if (storedMode === "queue") {
      setMode("queue");
    }
  }, []);

  const changeMode = (nextMode: WorkbenchMode) => {
    setMode(nextMode);
    window.localStorage.setItem("stock-classification:mode", nextMode);
  };

  const openCompanyFromContext = (stockCode: string, categoryId: number | null) => {
    setResearchFocusTask(null);
    setSelectedStockCode(null);
    setPendingCompanySelection({ stockCode, categoryId });
    setSelectedCategoryId(categoryId);
    changeMode("research");
  };

  const openTaskTarget = (item: ResearchQueueItem) => {
    if (!item.stockCode) {
      setSelectedCategoryId(item.categoryId);
      changeMode("atlas");
      return;
    }
    setResearchFocusTask(item);
    setSelectedStockCode(null);
    setPendingCompanySelection({ stockCode: item.stockCode, categoryId: item.categoryId });
    setSelectedCategoryId(item.categoryId);
    changeMode("research");
  };

  const refresh = () => setRefreshKey((value) => value + 1);

  return (
    <main className={`app-shell is-terminal-mode flex h-screen overflow-hidden ${mode === "atlas" ? "is-atlas-mode" : ""} ${mode === "results" ? "is-results-mode" : ""}`}>
      <div className="flex min-h-0 w-full flex-col">
        <div className="terminal-workspace-header">
          <div className="workspace-brand">
            <span className="workspace-brand-mark" aria-hidden="true">A</span>
            <div>
              <h1>A 股产业链分类工作台</h1>
              <p>产业关系、公司研究与证据核验的一体化工作空间</p>
            </div>
          </div>
          <WorkbenchModeSwitch
            value={mode}
            onChange={(nextMode) => {
              if (nextMode === "research") {
                setSelectedStockCode(null);
                setPendingCompanySelection(null);
                setResearchHomeKey((value) => value + 1);
              }
              changeMode(nextMode);
            }}
            onOpenQueue={() => changeMode("queue")}
          />
          <button type="button" className="workspace-profile" title="账户与偏好设置">
            <span>N</span><ChevronDown aria-hidden="true" />
          </button>
        </div>
        <GlobalMarketTicker />

        {mode === "research" ? (
          <ResearchWorkbench
            selectedCategoryId={selectedCategoryId}
            selectedStockCode={selectedStockCode}
            refreshKey={refreshKey}
            homeKey={researchHomeKey}
            focusTask={researchFocusTask}
            onSelectCompany={openCompanyFromContext}
            onOpenAtlas={() => changeMode("atlas")}
            onOpenSector={(categoryId) => {
              setSectorCategoryId(categoryId);
              changeMode("sector");
            }}
            onChanged={refresh}
          />
        ) : mode === "results" ? (
          <ResearchResultsLibrary
            refreshKey={refreshKey}
            onOpenCompany={openCompanyFromContext}
            onOpenAtlas={(categoryId) => {
              setSelectedCategoryId(categoryId);
              changeMode("atlas");
            }}
            onCreate={() => {
              setSelectedStockCode(null);
              setPendingCompanySelection(null);
              setResearchHomeKey((value) => value + 1);
              changeMode("research");
            }}
          />
        ) : mode === "sector" ? (
          <SectorResearch
            selectedCategoryId={sectorCategoryId}
            refreshKey={refreshKey}
            onSelectCategory={setSectorCategoryId}
            onOpenCompany={(stockCode) => {
              openCompanyFromContext(stockCode, sectorCategoryId);
            }}
            onOpenAtlas={() => {
              setSelectedCategoryId(sectorCategoryId);
              changeMode("atlas");
            }}
            onOpenWorkbench={() => changeMode("research")}
          />
        ) : mode === "queue" ? (
          <ResearchQueue
            refreshKey={refreshKey}
            onOpenCompany={openCompanyFromContext}
            onOpenTarget={openTaskTarget}
          />
        ) : (
          <IndustryAtlas
            selectedCategoryId={selectedCategoryId}
            selectedStockCode={selectedStockCode}
            refreshKey={refreshKey}
            onGraphChanged={refresh}
            onSelectCategory={setSelectedCategoryId}
            onSelectStock={setSelectedStockCode}
            onClearStock={() => setSelectedStockCode(null)}
            onClearSelection={() => {
              setSelectedCategoryId(null);
              setSelectedStockCode(null);
            }}
            onOpenResearch={(stockCode) => {
              setSelectedStockCode(stockCode);
              changeMode("research");
            }}
            onOpenSectorResearch={(categoryId) => {
              setSelectedCategoryId(categoryId);
              setSectorCategoryId(categoryId);
              changeMode("sector");
            }}
          />
        )}
      </div>
    </main>
  );
}
