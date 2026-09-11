"use client";

import dynamic from "next/dynamic";
import { Orbit } from "lucide-react";
import { useEffect, useState } from "react";
import { ResearchQueueDrawer } from "@/components/queue/ResearchQueue";
import type { WorkbenchMode } from "./types";
import { WorkbenchModeSwitch } from "./WorkbenchModeSwitch";
import { AccountWorkspace } from "./AccountWorkspace";
import type { AccountSection } from "./AccountWorkspace";
import { WorkspaceAccountActions } from "./WorkspaceAccountActions";
import { RichWorkbenchWorkspace } from "./RichWorkbenchWorkspace";
import { ResearchIntelligenceDock } from "./ResearchIntelligenceDock";
import type { ResearchQueue } from "@/lib/repositories/researchQueue";

// LEGACY WORKSPACES（按产品要求注释保留，不删除源码）：
// import { SectorResearch } from "@/components/sector/SectorResearch";
// import { ResearchWorkbench } from "./ResearchWorkbench";
// import { ResearchResultsLibrary } from "./ResearchResultsLibrary";
// import { GlobalMarketTicker } from "./GlobalMarketTicker";

const IndustryAtlas = dynamic(() => import("@/components/atlas/IndustryAtlas").then((module) => module.IndustryAtlas), {
  ssr: false,
  loading: () => <div className="atlas-loading" role="status">正在构建产业链星图</div>,
});

export function Workbench() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedStockCode, setSelectedStockCode] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mode, setMode] = useState<WorkbenchMode>("atlas");
  const [pendingCompanySelection, setPendingCompanySelection] = useState<{ stockCode: string; categoryId: number | null } | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueSummary, setQueueSummary] = useState({ attention: 0, running: 0 });
  const [accountSection, setAccountSection] = useState<AccountSection>("profile");

  useEffect(() => {
    setSelectedStockCode(null);
  }, [selectedCategoryId]);

  useEffect(() => {
    if (!pendingCompanySelection || selectedCategoryId !== pendingCompanySelection.categoryId) return;
    setSelectedStockCode(pendingCompanySelection.stockCode);
    setPendingCompanySelection(null);
  }, [pendingCompanySelection, selectedCategoryId]);

  useEffect(() => {
    const storedMode = window.localStorage.getItem("stock-classification:mode") as WorkbenchMode | null;
    if (storedMode && ["rich", "atlas", "ai", "report", "account"].includes(storedMode)) setMode(storedMode);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [mode]);

  useEffect(() => {
    void fetch("/api/research-queue", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<ResearchQueue> : Promise.reject(new Error("queue unavailable")))
      .then((queue) => setQueueSummary({
        attention: queue.items.filter((item) => item.taskStatus !== "in_progress").length,
        running: queue.items.filter((item) => item.taskStatus === "in_progress").length,
      }))
      .catch(() => setQueueSummary({ attention: 0, running: 0 }));
  }, [refreshKey, queueOpen]);

  const changeMode = (nextMode: WorkbenchMode) => {
    setMode(nextMode);
    window.localStorage.setItem("stock-classification:mode", nextMode);
  };

  const openCompanyFromContext = (stockCode: string, categoryId: number | null) => {
    setSelectedStockCode(null);
    setPendingCompanySelection({ stockCode, categoryId });
    setSelectedCategoryId(categoryId);
    setQueueOpen(false);
    changeMode("atlas");
  };

  // LEGACY 全屏任务跳转处理器已随旧任务页停用；任务抽屉统一复用 openCompanyFromContext。

  const refresh = () => setRefreshKey((value) => value + 1);
  return (
    <main className={`app-shell is-terminal-mode is-${mode}-mode flex h-screen overflow-hidden`} data-workspace={mode}>
      <div className="flex min-h-0 w-full flex-col">
        <div className="terminal-workspace-header">
          <div className="workspace-brand">
            <span className="workspace-brand-mark" aria-hidden="true"><Orbit /></span>
            <h1>Yidianx</h1>
          </div>
          <WorkbenchModeSwitch
            value={mode}
            onChange={changeMode}
          />
          <WorkspaceAccountActions
            queue={queueSummary}
            queueOpen={queueOpen}
            accountActive={mode === "account"}
            onOpenQueue={() => setQueueOpen(true)}
            onOpenAccount={(section) => { setAccountSection(section); changeMode("account"); }}
          />
        </div>
        {/* LEGACY GLOBAL TICKER（按产品要求注释保留）：<GlobalMarketTicker /> */}

        {mode === "rich" ? (
          <RichWorkbenchWorkspace onOpenAtlas={() => changeMode("atlas")} />
        ) : mode === "atlas" ? (
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
              changeMode("ai");
            }}
            onOpenReport={(stockCode) => { setSelectedStockCode(stockCode); changeMode("report"); }}
            onOpenSectorResearch={(categoryId) => {
              setSelectedCategoryId(categoryId);
              changeMode("atlas");
            }}
          />
        ) : mode === "ai" || mode === "report" ? (
          <section className="primary-intelligence-workspace" aria-label={mode === "ai" ? "AI研判" : "研报生成"}>
            <ResearchIntelligenceDock stockCode={selectedStockCode} companyName={selectedStockCode ?? ""} categoryId={selectedCategoryId} tab={mode === "ai" ? "agents" : "report"} onTabChange={(tab) => changeMode(tab === "agents" ? "ai" : "report")} onClose={() => changeMode("atlas")} embedded />
          </section>
        ) : (
          <AccountWorkspace section={accountSection} queueCount={queueSummary.attention} onOpenQueue={() => setQueueOpen(true)} onSectionChange={setAccountSection} />
        )}

        {/* LEGACY PAGE ROUTING（按产品要求注释保留，不删除原组件）：
            研究工作台 ResearchWorkbench、公司研究 SectorResearch、成果库 ResearchResultsLibrary
            与全屏任务中心 ResearchQueue 的旧渲染分支已停用。 */}
        <ResearchQueueDrawer open={queueOpen} refreshKey={refreshKey} onClose={() => setQueueOpen(false)} onOpenCompany={openCompanyFromContext} />
      </div>
    </main>
  );
}
