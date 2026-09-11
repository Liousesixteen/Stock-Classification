"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Maximize2, Minus, Plus, RefreshCw, RotateCcw, Settings2, X } from "lucide-react";
import type { Company } from "@/lib/domain/types";
import type { IndustryGraphDisplaySettings, IndustryGraphEdge, IndustryGraphNode, IndustryGraphPayload, IndustryGraphSignalFilter } from "@/lib/industry-graph/types";
import { companyEntityBranch, getCompanyFocusedGraphNeighborhood, type CompanyGraphBranch } from "@/lib/industry-graph/layout";
import { findResearchPaths, type ResearchPath } from "@/lib/industry-graph/pathExplorer";
import { getRelationEndpoints } from "@/lib/industry-graph/relations";
import type { CompanyDossierQuality } from "@/lib/research/companyDossierQuality";
import type { BusinessLine } from "@/lib/repositories/researchProfiles";
import { augmentGraphWithCompanyProfile } from "@/lib/industry-graph/companyProfileGraph";
import { getCompanyChainProfile } from "@/lib/industry-graph/companyChainProfiles";
import { AtlasClassificationManager } from "./AtlasClassificationManager";
import { AtlasCompanySnapshot, type AtlasCompanyState } from "./AtlasCompanySnapshot";
import { AtlasEntitySnapshot } from "./AtlasEntitySnapshot";
import { AtlasEvidenceSnapshot } from "./AtlasEvidenceSnapshot";
import { AtlasControlDock } from "./AtlasControlDock";
import { AtlasFocusSnapshot, type AtlasFocusContext } from "./AtlasFocusSnapshot";
import { AtlasLayerNav } from "./AtlasLayerNav";
import { AtlasMinimap } from "./AtlasMinimap";
import { GraphFallback } from "./GraphFallback";
import { IndustryGraphScene, type GalaxyViewController } from "./IndustryGraphScene";
import { ResizablePanelControls, useResizablePanelLayout } from "@/components/workbench/ResizablePanelControls";
import { WorkspaceState } from "@/components/workbench/WorkspaceState";

export type IndustryAtlasProps = {
  selectedCategoryId: number | null;
  selectedStockCode: string | null;
  refreshKey: number;
  onGraphChanged: () => void;
  onSelectCategory: (categoryId: number | null) => void;
  onSelectStock: (stockCode: string) => void;
  onClearStock: () => void;
  onClearSelection: () => void;
  onOpenResearch: (stockCode: string) => void;
  onOpenReport: (stockCode: string) => void;
  onOpenSectorResearch: (categoryId: number) => void;
};

type CompanyResponse = {
  company: Company;
  relations: Array<{ categoryName: string; relationType: string; confidence: string }>;
  evidenceByRelationId: Record<string, unknown[]>;
  researchProfile?: {
    summary?: string;
    businessLines?: BusinessLine[];
    chainPosition?: string[];
    competitiveAdvantages?: string[];
    keyCustomers?: string[];
    sourceSummary?: string;
  } | null;
  graphEntityRelations?: Array<{
    id: number;
    entityId: number;
    entityType: "产品/技术" | "客户/供应商" | "项目/产能" | "事件/政策";
    entityName: string;
    entitySummary: string;
    relationType: "核心产品" | "技术关联" | "供应/采购" | "客户验证" | "项目进展" | "政策催化" | "风险传导" | "竞争关系";
    confidence: "高" | "中" | "低";
    rationale: string;
    direction: "undirected" | "inbound" | "outbound" | "bidirectional";
    strength: number;
    observedAt: string;
    verificationStatus: "unverified" | "verified";
    evidenceCount: number;
    evidencePreviews: Array<{ id: number; sourceType: string; title: string; sourceDate: string; url: string; excerpt: string; credibility: "高" | "中" | "低"; verificationStatus: string }>;
  }>;
  quality: Pick<CompanyDossierQuality, "overallScore" | "fieldCoverageScore" | "evidenceCoverageScore" | "reliabilityLabel">;
};
const atlasLeftPanel = { defaultWidth: 232, minWidth: 212, maxWidth: 300 };
const atlasRightPanel = { defaultWidth: 336, minWidth: 304, maxWidth: 420 };
// Replaced by AtlasControlDock. Keep the former banner behind a switch so the
// original presentation can be restored without deleting its implementation.
const showLegacyAtlasHeader = false;

export function IndustryAtlas({ selectedCategoryId, selectedStockCode, refreshKey, onGraphChanged, onSelectCategory, onSelectStock, onClearStock, onClearSelection, onOpenResearch, onOpenReport, onOpenSectorResearch }: IndustryAtlasProps) {
  const [graphState, setGraphState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; graph: IndustryGraphPayload }>({ status: "loading" });
  const [companyState, setCompanyState] = useState<AtlasCompanyState>({ status: "idle" });
  const [webGlFailed, setWebGlFailed] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);
  const [signalFilter, setSignalFilter] = useState<IndustryGraphSignalFilter>("all");
  const [displaySettings, setDisplaySettings] = useState<IndustryGraphDisplaySettings>({ showCompanies: true, showCategories: true, showLinks: true, showEvidenceHeat: true });
  const [autoRotate, setAutoRotate] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [selectedEvidenceNodeId, setSelectedEvidenceNodeId] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<ResearchPath | null>(null);
  const [classificationOpen, setClassificationOpen] = useState(false);
  const [graphReloadKey, setGraphReloadKey] = useState(0);
  const [expandedCompanyBranch, setExpandedCompanyBranch] = useState<CompanyGraphBranch | null>(null);
  const panels = useResizablePanelLayout("stock-classification:atlas-panels", atlasLeftPanel, atlasRightPanel);
  const setAtlasPanelCollapsed = panels.setCollapsed;
  const viewControllerRef = useRef<GalaxyViewController | null>(null);
  const graph = graphState.status === "ready" ? graphState.graph : null;
  const companyChainProfile = useMemo(() => getCompanyChainProfile(selectedStockCode), [selectedStockCode]);
  const sceneGraph = useMemo(() => {
    if (!graph || !selectedStockCode || companyState.status !== "ready") return graph;
    return augmentGraphWithCompanyProfile(graph, {
      company: companyState.company,
      businessLines: companyState.businessLines ?? [],
      competitiveAdvantages: companyState.advantages,
      keyCustomers: companyState.keyCustomers ?? [],
      sourceSummary: companyState.sourceSummary ?? "",
      chainProfile: companyChainProfile,
    });
  }, [companyChainProfile, companyState, graph, selectedStockCode]);
  const selectedCategoryName = graph?.nodes.find((node) => node.kind === "category" && node.categoryId === selectedCategoryId)?.label ?? "";

  useEffect(() => {
    setExpandedCompanyBranch(null);
    setSelectedEntityId(null);
    setSelectedEvidenceNodeId(null);
  }, [selectedStockCode]);

  useEffect(() => {
    const applyResponsivePanels = () => {
      if (window.innerWidth <= 1040) {
        setAtlasPanelCollapsed("left", true);
        setAtlasPanelCollapsed("right", selectedCategoryId === null && !selectedStockCode);
      }
    };
    applyResponsivePanels();
    window.addEventListener("resize", applyResponsivePanels);
    return () => window.removeEventListener("resize", applyResponsivePanels);
  }, [setAtlasPanelCollapsed, selectedCategoryId, selectedStockCode]);

  useEffect(() => {
    const controller = new AbortController();
    setGraphState({ status: "loading" });
    fetch(`/api/industry-graph?refresh=${refreshKey}-${graphReloadKey}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("图谱资料加载失败"); return response.json() as Promise<IndustryGraphPayload>; })
      .then((payload) => setGraphState({ status: "ready", graph: payload }))
      .catch((error: unknown) => { if (!controller.signal.aborted) setGraphState({ status: "error", message: error instanceof Error ? error.message : "图谱资料加载失败" }); });
    return () => controller.abort();
  }, [graphReloadKey, refreshKey]);

  useEffect(() => {
    if (!selectedStockCode) { setCompanyState({ status: "idle" }); return; }
    const controller = new AbortController();
    const selectedNode = graph?.nodes.find((node) => node.kind === "company" && node.stockCode === selectedStockCode);
    setCompanyState({ status: "loading", name: selectedNode?.label });
    fetch(`/api/companies/${selectedStockCode}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("公司资料暂时不可用"); return response.json() as Promise<CompanyResponse>; })
      .then((data) => setCompanyState({
        status: "ready",
        company: data.company,
        relations: data.relations,
        evidenceCount: Object.values(data.evidenceByRelationId).reduce((sum, rows) => sum + rows.length, 0) + (data.graphEntityRelations ?? []).reduce((sum, relation) => sum + relation.evidenceCount, 0),
        summary: data.researchProfile?.summary || firstSentence(data.company.intro) || firstSentence(data.company.mainBusiness) || `${data.company.shortName}属于${data.company.industry || "当前产业链"}。`,
        advantages: data.researchProfile?.competitiveAdvantages ?? [],
        businessLines: data.researchProfile?.businessLines ?? [],
        chainPosition: data.researchProfile?.chainPosition ?? [],
        keyCustomers: data.researchProfile?.keyCustomers ?? [],
        sourceSummary: data.researchProfile?.sourceSummary ?? "",
        quality: data.quality,
        entityRelations: data.graphEntityRelations ?? [],
      }))
      .catch((error: unknown) => { if (!controller.signal.aborted) setCompanyState({ status: "error", message: error instanceof Error ? error.message : "公司资料暂时不可用", name: selectedNode?.label }); });
    return () => controller.abort();
  }, [graph, selectedStockCode]);

  const selectedNodeId = selectedEvidenceNodeId ?? (selectedEntityId ? `entity:${selectedEntityId}` : selectedStockCode ? `company:${selectedStockCode}` : selectedCategoryId ? `category:${selectedCategoryId}` : null);
  const focusContext = useMemo(() => graph ? getFocusContext(graph, selectedCategoryId) : null, [graph, selectedCategoryId]);
  const companyFocusContext = useMemo(() => {
    if (!graph || !selectedStockCode) return null;
    const companyNodeId = `company:${selectedStockCode}`;
    const company = graph.nodes.find((node) => node.id === companyNodeId && node.kind === "company");
    if (!company || company.kind !== "company") return null;
    const categoryIds = new Set(graph.edges.flatMap((edge) => {
      if (edge.kind !== "relation") return [];
      const endpoints = getRelationEndpoints(edge);
      return endpoints?.companyNodeId === companyNodeId ? [endpoints.categoryId] : [];
    }));
    const peerIds = new Set(graph.edges.flatMap((edge) => {
      if (edge.kind !== "relation") return [];
      const endpoints = getRelationEndpoints(edge);
      return endpoints && categoryIds.has(endpoints.categoryId) && endpoints.companyNodeId !== companyNodeId ? [endpoints.companyNodeId] : [];
    }));
    return {
      labels: [...(focusContext?.labels ?? [company.industry || "产业链"]), company.label],
      relationGroupCount: 5,
      relatedCompanyCount: peerIds.size,
      onBack: () => { setActivePath(null); setSelectedEntityId(null); setSelectedEvidenceNodeId(null); onClearStock(); },
      onReset: () => { setActivePath(null); setSelectedEntityId(null); setSelectedEvidenceNodeId(null); onClearSelection(); },
    };
  }, [focusContext, graph, onClearSelection, onClearStock, selectedStockCode]);
  const selectNode = useCallback((node: IndustryGraphNode) => {
    setActivePath(null);
    if (node.kind === "category") { setSelectedEntityId(null); setSelectedEvidenceNodeId(null); onSelectCategory(node.categoryId); }
    else if (node.kind === "company") { setSelectedEntityId(null); setSelectedEvidenceNodeId(null); onSelectStock(node.stockCode); }
    else if (node.kind === "entity") { setSelectedEntityId(node.entityId); setSelectedEvidenceNodeId(null); if (!selectedStockCode) onClearStock(); }
    else { setSelectedEvidenceNodeId(node.id); setSelectedEntityId(null); if (!selectedStockCode) onClearStock(); }
  }, [onClearStock, onSelectCategory, onSelectStock, selectedStockCode]);
  const statusText = useMemo(() => graph ? `${graph.stats.categoryCount} 个分类节点 · ${graph.stats.companyCount} 家公司 · ${graph.stats.evidenceCount} 条证据` : "产业数据装载中", [graph]);
  const selectedGraphRelations = useMemo(() => {
    if (!graph || !selectedStockCode) return [];
    const categoryLabels = new Map(graph.nodes.filter((node): node is Extract<IndustryGraphNode, { kind: "category" }> => node.kind === "category").map((node) => [node.id, node.label]));
    return graph.edges.flatMap((edge) => {
      if (edge.kind !== "relation") return [];
      const endpoints = getRelationEndpoints(edge);
      if (!endpoints || endpoints.companyNodeId !== `company:${selectedStockCode}`) return [];
      return [{ ...edge, categoryId: endpoints.categoryId, categoryName: categoryLabels.get(endpoints.categoryNodeId) ?? endpoints.categoryNodeId }];
    });
  }, [graph, selectedStockCode]);
  const selectedEntity = sceneGraph?.nodes.find((node): node is Extract<IndustryGraphNode, { kind: "entity" }> => node.kind === "entity" && node.entityId === selectedEntityId) ?? null;
  const selectedEvidence = sceneGraph?.nodes.find((node): node is Extract<IndustryGraphNode, { kind: "evidence" }> => node.kind === "evidence" && node.id === selectedEvidenceNodeId) ?? null;
  const selectedEntityRelations = useMemo(() => {
    if (!sceneGraph || !selectedEntity) return [];
    const companyNames = new Map(sceneGraph.nodes.filter((node): node is Extract<IndustryGraphNode, { kind: "company" }> => node.kind === "company").map((node) => [node.id, node.label]));
    return sceneGraph.edges.filter((edge): edge is Extract<IndustryGraphEdge, { kind: "entityRelation" }> => edge.kind === "entityRelation" && edge.target === selectedEntity.id).map((edge) => ({ ...edge, companyName: companyNames.get(edge.source) ?? edge.source }));
  }, [sceneGraph, selectedEntity]);
  const companyBranchCounts = useMemo(() => {
    const counts: Record<CompanyGraphBranch, number> = { upstream: 0, core: 0, downstream: 0, organization: 0, peer: 0 };
    if (!sceneGraph || !selectedStockCode) return counts;
    const nodeById = new Map(sceneGraph.nodes.map((node) => [node.id, node]));
    sceneGraph.edges.forEach((edge) => {
      if (edge.kind === "entityRelation" && edge.source === `company:${selectedStockCode}`) {
        counts[companyEntityBranch(nodeById.get(edge.target), edge)] += 1;
        return;
      }
      if (edge.kind !== "relation") return;
      const endpoints = getRelationEndpoints(edge);
      if (!endpoints) return;
      if (endpoints.companyNodeId === `company:${selectedStockCode}`) counts.core += 1;
    });
    const neighborhood = getCompanyFocusedGraphNeighborhood(sceneGraph, selectedStockCode);
    counts.peer += neighborhood.peerCompanyNodeIds.size;
    return counts;
  }, [sceneGraph, selectedStockCode]);
  const companyPeerNames = useMemo(() => {
    if (!sceneGraph || !selectedStockCode) return [];
    const neighborhood = getCompanyFocusedGraphNeighborhood(sceneGraph, selectedStockCode);
    return [...neighborhood.peerCompanyNodeIds]
      .map((nodeId) => sceneGraph.nodes.find((node) => node.id === nodeId && node.kind === "company")?.label)
      .filter((label): label is string => Boolean(label));
  }, [sceneGraph, selectedStockCode]);
  const companyPaths = useMemo(() => sceneGraph && selectedStockCode ? findResearchPaths(sceneGraph, `company:${selectedStockCode}`) : [], [sceneGraph, selectedStockCode]);
  const entityPaths = useMemo(() => sceneGraph && selectedEntity ? findResearchPaths(sceneGraph, selectedEntity.id) : [], [sceneGraph, selectedEntity]);
  const captureViewController = useCallback((runtime: GalaxyViewController | null) => { viewControllerRef.current = runtime; }, []);

  return (
    <div
      className={`industry-atlas atlas-workspace-v2 is-toolbar-consolidated ${selectedCategoryId !== null || selectedStockCode ? "is-local-focus" : ""} ${selectedStockCode ? "is-company-focus" : ""} ${panels.layout.leftCollapsed ? "is-left-panel-collapsed" : ""} ${panels.layout.rightCollapsed ? "is-right-panel-collapsed" : ""}`}
      style={panels.style}
    >
      {showLegacyAtlasHeader ? <div className="atlas-topbar"><div><span className="atlas-mark" aria-hidden="true"><i /><b /><em /></span><strong>产业链星图</strong><small>A-SHARE INDUSTRY INTELLIGENCE GRAPH</small></div><p><Activity aria-hidden="true" />{statusText}</p><button type="button" onClick={() => { setActivePath(null); setSelectedEntityId(null); setSelectedEvidenceNodeId(null); onClearSelection(); setSceneKey((value) => value + 1); }} title="重置星图"><RotateCcw aria-hidden="true" /></button></div> : null}
      <ResizablePanelControls layout={panels.layout} bounds={panels.bounds} onResize={panels.resize} onResizeByKeyboard={panels.resizeByKeyboard} onToggle={panels.toggle} />
      {graphState.status === "loading" ? <WorkspaceState state="loading" title="正在构建产业链星图" description="读取分类、公司、关系与证据节点" /> : null}
      {graphState.status === "error" ? <WorkspaceState state="error" title="产业链图谱暂时不可用" description={graphState.message} onAction={() => setGraphReloadKey((value) => value + 1)} /> : null}
      {graph ? (
        <>
          <AtlasLayerNav nodes={graph.nodes} selectedCategoryId={selectedCategoryId} signalFilter={signalFilter} displaySettings={displaySettings} onSelect={onSelectCategory} onSignalFilterChange={setSignalFilter} onDisplaySettingsChange={setDisplaySettings} onManageCategories={() => setClassificationOpen(true)} />
          <AtlasControlDock nodes={graph.nodes} focus={focusContext} companyFocus={companyFocusContext} signalFilter={signalFilter} onSignalFilterChange={setSignalFilter} stats={graph.stats} onSelectNode={selectNode} onSelectCategory={onSelectCategory} onReset={() => { setActivePath(null); setSelectedEntityId(null); setSelectedEvidenceNodeId(null); onClearSelection(); setSceneKey((value) => value + 1); }} />
          {webGlFailed ? <GraphFallback graph={sceneGraph ?? graph} onSelectNode={selectNode} /> : <IndustryGraphScene key={sceneKey} graph={sceneGraph ?? graph} focusedCategoryId={selectedCategoryId} focusedCompanyCode={selectedStockCode} expandedCompanyBranch={expandedCompanyBranch} selectedNodeId={selectedNodeId} highlightedPathNodeIds={activePath?.nodeIds ?? []} signalFilter={signalFilter} displaySettings={displaySettings} onRuntimeReady={captureViewController} onSelectNode={selectNode} onWebGlFailure={() => setWebGlFailed(true)} />}
          {selectedEvidence ? <AtlasEvidenceSnapshot evidence={selectedEvidence} onClose={() => setSelectedEvidenceNodeId(null)} /> : selectedEntity ? <AtlasEntitySnapshot entity={selectedEntity} relations={selectedEntityRelations} paths={entityPaths} activePathId={activePath?.id} onActivatePath={setActivePath} onClose={() => { setActivePath(null); setSelectedEntityId(null); }} onOpenCompany={(stockCode) => { setActivePath(null); setSelectedEntityId(null); onSelectStock(stockCode); }} /> : selectedStockCode ? <AtlasCompanySnapshot stockCode={selectedStockCode} state={companyState} chainProfile={companyChainProfile} graphRelations={selectedGraphRelations} peerCompanies={companyPeerNames} paths={companyPaths} activePathId={activePath?.id} activeBranch={expandedCompanyBranch} branchCounts={companyBranchCounts} onActivatePath={setActivePath} onFocusCategory={onSelectCategory} onSelectEntity={(entityId) => { setActivePath(null); setSelectedEvidenceNodeId(null); setSelectedEntityId(entityId); }} onBranchChange={(value) => { setActivePath(null); setSelectedEntityId(null); setSelectedEvidenceNodeId(null); setExpandedCompanyBranch(value); }} onClose={() => { setActivePath(null); onClearStock(); }} onOpenResearch={onOpenResearch} onOpenReport={onOpenReport} /> : <AtlasFocusSnapshot graph={graph} focus={focusContext} onSelectCompany={onSelectStock} />}
          <AtlasMinimap graph={sceneGraph ?? graph} focusedCategoryId={selectedCategoryId} focusedCompanyCode={selectedStockCode} expandedCompanyBranch={expandedCompanyBranch} selectedNodeId={selectedNodeId} />
      <div className="atlas-bottom-status"><div className="atlas-view-controls"><span>视图控制</span><button type="button" title="缩小" onClick={() => viewControllerRef.current?.zoomBy(1.2)}><Minus aria-hidden="true" /></button><b>100%</b><button type="button" title="放大" onClick={() => viewControllerRef.current?.zoomBy(0.82)}><Plus aria-hidden="true" /></button><button type="button" title="适应画布" onClick={() => viewControllerRef.current?.resetView()}><Maximize2 aria-hidden="true" /></button><button className={autoRotate ? "is-active" : ""} type="button" title="自动旋转" onClick={() => { const next = !autoRotate; setAutoRotate(next); viewControllerRef.current?.setAutoRotate(next); }}><RefreshCw aria-hidden="true" /></button></div>{selectedStockCode ? <div className="atlas-relationship-legend" aria-label="公司关系连线图例"><span className="is-upstream">供应输入</span><span className="is-downstream">客户应用</span><span className="is-core">核心技术</span><span className="is-organization">组织产能</span><span className="is-peer">同业竞争</span></div> : null}<p>{selectedStockCode ? "公司知识星图 · 点击关系节点查看依据 · 返回上层回到产业链" : selectedCategoryId !== null ? "拖拽旋转三维轨道 · 滚轮缩放 · 悬浮读取公司快照" : "拖动旋转 · 滚轮缩放 · 点击节点进入局部产业链"}</p><b>{webGlFailed ? "2D FALLBACK" : "WEBGL ACTIVE"}</b></div>
        </>
      ) : null}
      {classificationOpen ? (
        <div className="atlas-classification-overlay" role="dialog" aria-modal="true" aria-label="自定义产业链分类">
          <button className="atlas-classification-backdrop" type="button" aria-label="关闭自定义分类" onClick={() => setClassificationOpen(false)} />
          <aside className="atlas-classification-drawer">
            <header><div><Settings2 aria-hidden="true" /><span><b>自定义产业链</b><small>新增分组会实时进入星图</small></span></div><button type="button" title="关闭" onClick={() => setClassificationOpen(false)}><X aria-hidden="true" /></button></header>
            <AtlasClassificationManager selectedCategoryId={selectedCategoryId} selectedCategoryName={selectedCategoryName} onSelect={onSelectCategory} onClearSelection={onClearSelection} onChanged={onGraphChanged} refreshKey={refreshKey} onSelectStock={onSelectStock} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function getFocusContext(graph: IndustryGraphPayload, categoryId: number | null): AtlasFocusContext | null {
  if (categoryId === null) return null;
  const categories = graph.nodes.filter((node): node is Extract<IndustryGraphNode, { kind: "category" }> => node.kind === "category");
  const categoryById = new Map(categories.map((category) => [category.categoryId, category]));
  const selected = categoryById.get(categoryId);
  if (!selected) return null;
  const lineage = [] as typeof categories;
  let cursor: typeof selected | undefined = selected;
  while (cursor) {
    lineage.unshift(cursor);
    cursor = cursor.parentId === null ? undefined : categoryById.get(cursor.parentId);
  }
  const belongsToFocus = (id: number) => {
    let item = categoryById.get(id);
    while (item) {
      if (item.categoryId === categoryId) return true;
      item = item.parentId === null ? undefined : categoryById.get(item.parentId);
    }
    return false;
  };
  const focusedCategoryIds = new Set(categories.filter((category) => belongsToFocus(category.categoryId)).map((category) => category.categoryId));
  const companyCount = new Set(graph.edges.flatMap((edge) => {
    if (edge.kind !== "relation") return [];
    const endpoints = getRelationEndpoints(edge);
    return endpoints && focusedCategoryIds.has(endpoints.categoryId) ? [endpoints.companyNodeId] : [];
  })).size;
  return { categoryId: selected.categoryId, labels: lineage.map((category) => category.label), categoryCount: focusedCategoryIds.size, companyCount, parentId: selected.parentId };
}

function firstSentence(value: string) {
  return value.split(/[。！？]/).map((item) => item.trim()).find(Boolean) ?? "";
}
