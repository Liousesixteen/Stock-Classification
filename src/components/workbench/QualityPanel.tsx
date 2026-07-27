"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type QualityIssue = {
  type: "缺公司简介" | "缺证据" | "低确信度" | "待验证关系" | "缺业务占比" | "缺毛利率" | "缺核心客户";
  severity: "high" | "medium" | "low";
  stockCode?: string;
  relationId?: number;
  message: string;
};

type QualityPanelProps = {
  refreshKey: number;
  variant?: "panel" | "dock";
  onOpenCompany?: (stockCode: string) => void;
};

export function QualityPanel({ refreshKey, variant = "panel", onOpenCompany }: QualityPanelProps) {
  const [checks, setChecks] = useState<QualityIssue[]>([]);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/quality")
      .then((response) => response.json() as Promise<{ checks: QualityIssue[] }>)
      .then((payload) => {
        if (isMounted) setChecks(payload.checks);
      });
    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  const grouped = useMemo(() => {
    return checks.reduce<Record<string, QualityIssue[]>>((groups, issue) => {
      groups[issue.type] = groups[issue.type] ?? [];
      groups[issue.type].push(issue);
      return groups;
    }, {});
  }, [checks]);

  const body = (
    <>
      <div className="mb-3">
        <div className="text-xs font-semibold uppercase text-muted">数据质量</div>
        <h2 className="mt-1 text-lg font-semibold">待复核项</h2>
      </div>

      {checks.length === 0 ? <div className="text-sm text-muted">暂无数据质量问题。</div> : null}

      <div className="grid max-h-80 gap-3 overflow-auto">
        {Object.entries(grouped).map(([type, items]) => (
          <div key={type} className="rounded-md border border-line">
            <div className="flex items-center justify-between border-b border-line bg-panel px-3 py-2 text-sm font-semibold">
              <span>{type}</span>
              <span className="text-xs text-muted">{items.length}</span>
            </div>
            <div className="grid gap-1 p-2">
              {items.slice(0, 8).map((item) => item.stockCode ? (
                <button key={`${item.type}-${item.stockCode}-${item.relationId ?? ""}-${item.message}`} type="button" className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left text-xs text-slate-700 hover:bg-[#eef9f6] hover:text-[#0f766e]" onClick={() => { if (item.stockCode) onOpenCompany?.(item.stockCode); }}>
                  <span>{item.message}</span><span className="text-[10px] text-muted">处理</span>
                </button>
              ) : (
                <div key={`${item.type}-${item.message}`} className="text-xs text-slate-700">{item.message}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );

  if (variant === "dock") {
    return (
      <details className="group relative">
        <summary className="action-button flex h-12 cursor-pointer list-none items-center justify-center gap-2 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <ShieldCheck className="h-4 w-4 text-[#146c4a]" />
          质量
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-muted">{checks.length}</span>
        </summary>
        <div className="future-panel absolute right-0 top-14 z-30 w-[min(420px,calc(100vw-2rem))] p-4">
          {body}
        </div>
      </details>
    );
  }

  return (
    <section className="future-panel p-4">
      {body}
    </section>
  );
}
