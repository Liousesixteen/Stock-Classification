"use client";

import { useEffect, useMemo, useState } from "react";

type QualityIssue = {
  type: "缺公司简介" | "缺证据" | "低确信度" | "待验证关系";
  severity: "high" | "medium" | "low";
  stockCode?: string;
  relationId?: number;
  message: string;
};

type QualityPanelProps = {
  refreshKey: number;
};

export function QualityPanel({ refreshKey }: QualityPanelProps) {
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

  return (
    <section className="rounded-lg border border-line bg-white p-4">
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
              {items.slice(0, 8).map((item) => (
                <div key={`${item.type}-${item.stockCode ?? ""}-${item.relationId ?? ""}-${item.message}`} className="text-xs text-slate-700">
                  {item.message}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
