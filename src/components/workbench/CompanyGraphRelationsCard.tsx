"use client";

import { Check, FileText, Link2, Network, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { CompanyGraphEntityRelation } from "@/lib/repositories/graphEntities";

const entityTypes = ["产品/技术", "客户/供应商", "项目/产能", "事件/政策"] as const;
const relationTypes = ["核心产品", "技术关联", "供应/采购", "客户验证", "项目进展", "政策催化", "风险传导", "竞争关系"] as const;
const sourceTypes = ["年报", "公告", "互动易", "研报", "网页", "手动备注", "其他"] as const;

type Draft = {
  entityType: (typeof entityTypes)[number]; entityName: string; entitySummary: string; relationType: (typeof relationTypes)[number]; confidence: "高" | "中" | "低"; rationale: string; isWatchlist: boolean; direction: "undirected" | "inbound" | "outbound" | "bidirectional"; strength: number; sourceType: (typeof sourceTypes)[number]; evidenceTitle: string; evidenceDate: string; evidenceUrl: string; evidenceExcerpt: string;
};

const emptyDraft = (): Draft => ({ entityType: "产品/技术", entityName: "", entitySummary: "", relationType: "核心产品", confidence: "中", rationale: "", isWatchlist: false, direction: "outbound", strength: 65, sourceType: "手动备注", evidenceTitle: "", evidenceDate: "", evidenceUrl: "", evidenceExcerpt: "" });

export function CompanyGraphRelationsCard({ stockCode, relations, onSaved }: { stockCode: string; relations: CompanyGraphEntityRelation[]; onSaved: () => Promise<void> | void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<Draft>) => { setDraft((current) => ({ ...current, ...patch })); setError(""); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.entityName.trim() || !draft.rationale.trim() || (!draft.evidenceTitle.trim() && !draft.evidenceUrl.trim() && !draft.evidenceExcerpt.trim())) {
      setError("请填写实体名称、关系说明和至少一项证据内容");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/companies/${stockCode}/graph-relations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: draft.entityType, entityName: draft.entityName, entitySummary: draft.entitySummary, relationType: draft.relationType, confidence: draft.confidence, rationale: draft.rationale, isWatchlist: draft.isWatchlist, direction: draft.direction, strength: draft.strength, observedAt: draft.evidenceDate || new Date().toISOString(), evidence: { sourceType: draft.sourceType, title: draft.evidenceTitle, sourceDate: draft.evidenceDate, url: draft.evidenceUrl, excerpt: draft.evidenceExcerpt } }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) { setError(result.error ?? "保存图谱关系失败"); return; }
      await onSaved();
      setDraft(emptyDraft());
      setIsEditing(false);
    } finally { setSaving(false); }
  };

  return <section className="detail-section company-graph-relations">
    <div className="mb-2 flex items-center justify-between gap-2"><h3 className="flex items-center gap-1.5 font-semibold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-50 text-cyan-700"><Network className="h-4 w-4" /></span>外部关系图谱</h3><button type="button" className="action-button inline-flex h-8 items-center gap-1.5 px-2.5 text-xs font-semibold" onClick={() => { setIsEditing((value) => !value); setError(""); }}><>{isEditing ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}</>{isEditing ? "取消" : "添加关系"}</button></div>
    <p className="mb-3 text-xs leading-5 text-muted">产品、技术、客户、项目和事件只有附带证据后才会进入正式研究图谱。</p>
    {isEditing ? <form onSubmit={submit} className="graph-relation-form">
      <div className="grid grid-cols-2 gap-2"><FieldSelect label="实体类型" value={draft.entityType} options={entityTypes} onChange={(value) => update({ entityType: value as Draft["entityType"] })} /><FieldSelect label="关系类型" value={draft.relationType} options={relationTypes} onChange={(value) => update({ relationType: value as Draft["relationType"] })} /></div>
      <label>实体名称<input value={draft.entityName} onChange={(event) => update({ entityName: event.target.value })} placeholder="如：先进封装、核心客户、扩产项目" /></label>
      <label>实体说明（可选）<textarea value={draft.entitySummary} onChange={(event) => update({ entitySummary: event.target.value })} rows={2} placeholder="说明该实体在研究中的含义" /></label>
      <div className="grid grid-cols-2 gap-2"><FieldSelect label="关系可信度" value={draft.confidence} options={["高", "中", "低"]} onChange={(value) => update({ confidence: value as Draft["confidence"] })} /><FieldSelect label="方向" value={draft.direction} options={["undirected", "inbound", "outbound", "bidirectional"]} onChange={(value) => update({ direction: value as Draft["direction"] })} /></div>
      <div className="grid grid-cols-2 gap-2"><label>关系强度 · {draft.strength}<input type="range" min="0" max="100" step="5" value={draft.strength} onChange={(event) => update({ strength: Number(event.target.value) })} /></label><FieldSelect label="证据来源" value={draft.sourceType} options={sourceTypes} onChange={(value) => update({ sourceType: value as Draft["sourceType"] })} /></div>
      <label>关系说明<textarea value={draft.rationale} onChange={(event) => update({ rationale: event.target.value })} rows={3} placeholder="公司与该实体如何关联，影响路径是什么" /></label>
      <label>证据标题 / 链接 / 摘录<input value={draft.evidenceTitle} onChange={(event) => update({ evidenceTitle: event.target.value })} placeholder="如：2025 年报业务章节" /></label>
      <div className="grid grid-cols-2 gap-2"><label>证据日期（可选）<input type="date" value={draft.evidenceDate} onChange={(event) => update({ evidenceDate: event.target.value })} /></label><label>证据链接（可选）<input value={draft.evidenceUrl} onChange={(event) => update({ evidenceUrl: event.target.value })} placeholder="https://" /></label></div>
      <label>证据摘录（可选）<input value={draft.evidenceExcerpt} onChange={(event) => update({ evidenceExcerpt: event.target.value })} placeholder="可追溯的关键表述" /></label>
      <label className="graph-watch"><input type="checkbox" checked={draft.isWatchlist} onChange={(event) => update({ isWatchlist: event.target.checked })} />加入重点跟踪</label>
      <div className="flex items-center justify-end gap-2">{error ? <span className="text-xs text-rose-600">{error}</span> : null}<button type="submit" disabled={saving} className="action-button-primary inline-flex h-8 items-center gap-1.5 px-3 text-xs font-semibold"><Check className="h-3.5 w-3.5" />{saving ? "保存中" : "保存关系"}</button></div>
    </form> : null}
    {relations.length ? <div className="graph-relation-list">{relations.map((relation) => <div key={relation.id}><div className="graph-relation-heading"><span>{relation.entityType}</span><strong>{relation.entityName}</strong><em>{relation.relationType} · {relation.confidence}</em></div><p>{relation.rationale}</p><small><Network className="h-3 w-3" />{directionLabel(relation.direction)} · 强度 {relation.strength} · {relation.observedAt.slice(0, 10) || "时间待补"}</small><small><FileText className="h-3 w-3" />{relation.evidencePreviews.map((evidence) => evidence.title).join(" · ") || "证据待补"}</small></div>)}</div> : <div className="rounded-md border border-dashed border-line bg-white/45 p-3 text-xs leading-5 text-muted"><Link2 className="mr-1 inline h-3.5 w-3.5" />尚未沉淀外部关系。可从核心产品、技术路线、客户验证、项目进展或事件政策开始。</div>}
  </section>;
}

function FieldSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{directionLabel(option)}</option>)}</select></label>;
}

function directionLabel(value: string) {
  return ({ undirected: "关联", inbound: "上游 → 公司", outbound: "公司 → 下游", bidirectional: "双向" } as Record<string, string>)[value] ?? value;
}
