"use client";

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
  refreshKey: number;
};

export function CompanyDetails({ stockCode, refreshKey }: CompanyDetailsProps) {
  const [data, setData] = useState<CompanyDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!stockCode) {
      setData(null);
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
      <div className="text-xs font-semibold uppercase text-muted">公司研究详情</div>
      <h2 className="mt-1 text-xl font-semibold">{company.shortName}</h2>
      <p className="mt-1 text-sm text-muted">
        {company.stockCode} · {company.board || "上市板待补"} · {company.industry || "行业待补"}
      </p>

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
