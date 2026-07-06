"use client";

import { Check, Pencil, X } from "lucide-react";
import { type FormEvent } from "react";
import { useEffect, useState } from "react";
import type { Company } from "@/lib/domain/types";

type CompanyRelation = {
  id: number;
  categoryName: string;
  relationType: string;
  confidence: string;
  rationale: string;
  isWatchlist: boolean;
};

type EvidenceRow = {
  id: number;
  sourceType: string;
  title: string;
  sourceDate: string;
  url: string;
  excerpt: string;
  credibility: string;
};

type CompanyDetailResponse = {
  company: Company;
  relations: CompanyRelation[];
  evidenceByRelationId: Record<string, EvidenceRow[]>;
  notes: Array<{ id: number; noteType: string; content: string }>;
};

type CompanyDetailsProps = {
  stockCode: string | null;
  onChanged: () => void;
  refreshKey: number;
};

type CompanyDraft = {
  shortName: string;
  fullName: string;
  board: string;
  industry: string;
  region: string;
  marketCapBand: string;
  intro: string;
  mainBusiness: string;
};

function draftFromCompany(company: Company): CompanyDraft {
  return {
    shortName: company.shortName,
    fullName: company.fullName,
    board: company.board,
    industry: company.industry,
    region: company.region,
    marketCapBand: company.marketCapBand,
    intro: company.intro,
    mainBusiness: company.mainBusiness,
  };
}

export function CompanyDetails({ stockCode, onChanged, refreshKey }: CompanyDetailsProps) {
  const [data, setData] = useState<CompanyDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<CompanyDraft | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!stockCode) {
      setData(null);
      setIsEditing(false);
      setDraft(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    fetch(`/api/companies/${stockCode}`)
      .then((response) => response.json() as Promise<CompanyDetailResponse>)
      .then((payload) => {
        if (isMounted) setData(payload);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshKey, stockCode]);

  const startEditing = () => {
    if (!data) return;
    setDraft(draftFromCompany(data.company));
    setFormError("");
    setIsEditing(true);
  };

  const updateDraft = (patch: Partial<CompanyDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setFormError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stockCode || !draft) return;
    if (!draft.shortName.trim()) {
      setFormError("公司简称不能为空");
      return;
    }

    const response = await fetch(`/api/companies/${stockCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const result = (await response.json().catch(() => ({}))) as { company?: Company; error?: string };
    if (!response.ok || !result.company) {
      setFormError(result.error ?? "保存公司资料失败");
      return;
    }

    setData((current) => (current ? { ...current, company: result.company! } : current));
    setIsEditing(false);
    setDraft(null);
    onChanged();
  };

  if (!stockCode) {
    return (
      <div>
        <div className="text-xs font-semibold uppercase text-muted">公司研究详情</div>
        <div className="mt-8 rounded-md border border-dashed border-line bg-panel p-6 text-sm text-muted">请选择一家公司查看研究详情</div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div>
        <div className="text-xs font-semibold uppercase text-muted">公司研究详情</div>
        <div className="mt-4 text-sm text-muted">加载公司详情中...</div>
      </div>
    );
  }

  const { company, relations, evidenceByRelationId, notes } = data;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-muted">公司研究详情</div>
          <h2 className="mt-1 text-xl font-semibold">{company.shortName}</h2>
          <p className="mt-1 text-sm text-muted">
            {company.stockCode} · {company.board || "上市板待补"} · {company.industry || "行业待补"}
          </p>
        </div>
        <button
          type="button"
          onClick={isEditing ? () => setIsEditing(false) : startEditing}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-line px-3 text-sm font-semibold text-slate-700 transition hover:border-[#8fbda7] hover:bg-[#eef8f3]"
        >
          {isEditing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          {isEditing ? "取消编辑" : "编辑公司资料"}
        </button>
      </div>

      {isEditing && draft ? (
        <form onSubmit={handleSubmit} className="mt-4 rounded-md border border-[#cfe2d8] bg-[#f7fbf9] p-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              公司简称
              <input
                value={draft.shortName}
                onChange={(event) => updateDraft({ shortName: event.target.value })}
                className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              上市板
              <input
                value={draft.board}
                onChange={(event) => updateDraft({ board: event.target.value })}
                className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              行业
              <input
                value={draft.industry}
                onChange={(event) => updateDraft({ industry: event.target.value })}
                className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              地区
              <input
                value={draft.region}
                onChange={(event) => updateDraft({ region: event.target.value })}
                className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-slate-600">
              公司全称
              <input
                value={draft.fullName}
                onChange={(event) => updateDraft({ fullName: event.target.value })}
                className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-slate-600">
              市值区间
              <input
                value={draft.marketCapBand}
                onChange={(event) => updateDraft({ marketCapBand: event.target.value })}
                className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-slate-600">
              公司简介
              <textarea
                value={draft.intro}
                onChange={(event) => updateDraft({ intro: event.target.value })}
                rows={3}
                className="resize-none rounded border border-line bg-white px-2 py-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-slate-600">
              主营业务
              <textarea
                value={draft.mainBusiness}
                onChange={(event) => updateDraft({ mainBusiness: event.target.value })}
                rows={3}
                className="resize-none rounded border border-line bg-white px-2 py-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            {formError ? <span className="text-xs text-rose-600">{formError}</span> : null}
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1 rounded-md bg-[#146c4a] px-3 text-sm font-semibold text-white transition hover:bg-[#10583c]"
            >
              <Check className="h-4 w-4" />
              保存公司资料
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-auto pr-1 text-sm">
        <section>
          <h3 className="mb-1 font-semibold">公司简介</h3>
          <p className="leading-6 text-slate-700">{company.intro || "暂无公司简介，可在导入模板中补充。"}</p>
        </section>

        <section className="border-t border-line pt-3">
          <h3 className="mb-2 font-semibold">基础信息</h3>
          <div className="grid grid-cols-2 gap-2 text-slate-700">
            <span>地区：{company.region || "待补"}</span>
            <span>市值：{company.marketCapBand || "待补"}</span>
            <span>全称：{company.fullName || "待补"}</span>
            <span>更新：{company.updatedAt || "待补"}</span>
          </div>
        </section>

        <section className="border-t border-line pt-3">
          <h3 className="mb-2 font-semibold">分类关系</h3>
          <div className="grid gap-2">
            {relations.map((relation) => (
              <div key={relation.id} className="rounded-md border border-line bg-panel p-2">
                <div className="font-semibold">{relation.categoryName}</div>
                <div className="mt-1 text-xs text-muted">
                  {relation.relationType} · {relation.confidence}
                  {relation.isWatchlist ? " · 待复核" : ""}
                </div>
                <p className="mt-1 text-slate-700">{relation.rationale || "暂无判断说明"}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line pt-3">
          <h3 className="mb-2 font-semibold">业务证据</h3>
          <div className="grid gap-2">
            {relations.flatMap((relation) =>
              (evidenceByRelationId[String(relation.id)] ?? []).map((evidence) => (
                <div key={evidence.id} className="rounded-md border border-line p-2">
                  <div className="font-semibold">{evidence.title}</div>
                  <div className="mt-1 text-xs text-muted">
                    {evidence.sourceType} · {evidence.credibility} · {evidence.sourceDate || "日期待补"}
                  </div>
                  <p className="mt-1 text-slate-700">{evidence.excerpt || evidence.url || "暂无摘录"}</p>
                </div>
              )),
            )}
            {relations.every((relation) => (evidenceByRelationId[String(relation.id)] ?? []).length === 0) ? (
              <div className="text-muted">暂无证据来源。</div>
            ) : null}
          </div>
        </section>

        <section className="border-t border-line pt-3">
          <h3 className="mb-1 font-semibold">产品与产业位置</h3>
          <p className="leading-6 text-slate-700">{company.mainBusiness || "待补：核心产品、上游原料、下游应用、国产替代环节。"}</p>
        </section>

        <section className="border-t border-line pt-3">
          <h3 className="mb-2 font-semibold">研究字段</h3>
          <div className="grid gap-2">
            {notes.length === 0 ? <div className="text-muted">暂无研究备注。</div> : null}
            {notes.map((note) => (
              <div key={note.id} className="rounded-md bg-panel p-2">
                <div className="text-xs font-semibold text-muted">{note.noteType}</div>
                <div className="mt-1">{note.content}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
