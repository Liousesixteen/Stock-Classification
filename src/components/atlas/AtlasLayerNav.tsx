"use client";

import { Building2, FileCheck2, GitBranch, Layers3, RotateCcw, Search, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { IndustryGraphDisplaySettings, IndustryGraphNode, IndustryGraphSignalFilter } from "@/lib/industry-graph/types";
import { AtlasSignalFilter } from "./AtlasSignalFilter";

type DisplayKey = keyof IndustryGraphDisplaySettings;

const layerRows: Array<{ key: DisplayKey; label: string; icon: typeof Building2 }> = [
  { key: "showCompanies", label: "显示公司节点", icon: Building2 },
  { key: "showCategories", label: "显示产业节点", icon: Layers3 },
  { key: "showLinks", label: "显示关系连线", icon: GitBranch },
  { key: "showEvidenceHeat", label: "显示证据节点", icon: FileCheck2 },
];

export function AtlasLayerNav({ nodes, selectedCategoryId, signalFilter, displaySettings, onSelect, onSignalFilterChange, onDisplaySettingsChange, onManageCategories }: {
  nodes: IndustryGraphNode[];
  selectedCategoryId: number | null;
  signalFilter: IndustryGraphSignalFilter;
  displaySettings: IndustryGraphDisplaySettings;
  onSelect: (categoryId: number | null) => void;
  onSignalFilterChange: (value: IndustryGraphSignalFilter) => void;
  onDisplaySettingsChange: (value: IndustryGraphDisplaySettings) => void;
  onManageCategories: () => void;
}) {
  const [query, setQuery] = useState("");
  const allCategories = nodes.filter((node): node is Extract<IndustryGraphNode, { kind: "category" }> => node.kind === "category");
  const categories = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return allCategories
      .filter((node) => node.level <= 1 && (!normalized || node.label.toLocaleLowerCase().includes(normalized)))
      .sort((left, right) => left.level - right.level || left.categoryId - right.categoryId);
  }, [allCategories, query]);

  return (
    <aside className="atlas-layer-nav" data-testid="atlas-layer-nav">
      <div className="atlas-panel-heading"><div><span>图谱图层</span><small>GRAPH LAYERS</small></div><button type="button" title="重置图层" onClick={() => onDisplaySettingsChange({ showCompanies: true, showCategories: true, showLinks: true, showEvidenceHeat: true })}><RotateCcw aria-hidden="true" />重置</button></div>
      <div className="atlas-layer-switches">
        {layerRows.map(({ key, label, icon: Icon }) => <button key={key} type="button" role="switch" aria-checked={displaySettings[key]} onClick={() => onDisplaySettingsChange({ ...displaySettings, [key]: !displaySettings[key] })}><Icon aria-hidden="true" /><span>{label}</span><i className={displaySettings[key] ? "is-on" : ""} /></button>)}
      </div>

      <div className="atlas-category-heading"><div><span>产业链分类</span><small>{allCategories.length}</small></div><label><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索分类" aria-label="搜索产业链分类" /></label></div>
      <div className="atlas-category-list">
        <button className={selectedCategoryId === null ? "is-active" : ""} type="button" onClick={() => onSelect(null)}><i /><span>全部节点</span><b>{nodes.length}</b></button>
        {categories.map((node) => (
          <button className={selectedCategoryId === node.categoryId ? "is-active" : ""} key={node.id} type="button" onClick={() => onSelect(node.categoryId)}>
            <i />
            <span>{node.label}{node.level === 0 ? "（全链）" : ""}</span>
            <b>{node.level === 0 ? "ROOT" : node.level}</b>
          </button>
        ))}
      </div>
      <AtlasSignalFilter value={signalFilter} onChange={onSignalFilterChange} />
      <button className="atlas-custom-category-button" type="button" onClick={onManageCategories}>
        <Settings2 aria-hidden="true" />
        <span>自定义分类</span>
      </button>
    </aside>
  );
}
