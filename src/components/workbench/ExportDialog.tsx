"use client";

import { DatabaseBackup, Download, FileSpreadsheet } from "lucide-react";
import { useState } from "react";

export function ExportDialog() {
  const [busy, setBusy] = useState<"json" | "csv" | null>(null);

  const download = async (format: "json" | "csv") => {
    setBusy(format);
    try {
      const response = await fetch(`/api/export?format=${format}`);
      if (!response.ok) throw new Error("export unavailable");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `stock-classification-${new Date().toISOString().slice(0, 10)}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  };

  return (
    <details className="group relative">
      <summary className="action-button flex h-12 cursor-pointer list-none items-center justify-center gap-2 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <Download className="h-4 w-4 text-[#087f72]" />
        导出
      </summary>
      <div className="future-panel absolute right-0 top-14 z-30 w-[min(360px,calc(100vw-2rem))] p-4">
        <div className="text-xs font-semibold uppercase text-muted">研究归档</div>
        <h2 className="mt-1 text-lg font-semibold">导出本地成果</h2>
        <p className="mt-2 text-sm leading-6 text-muted">完整备份用于迁移与归档；关系表适合继续在表格工具中筛选分析。</p>
        <div className="mt-4 grid gap-2">
          <button type="button" className="action-button flex min-h-12 items-center gap-3 px-3 text-left" disabled={busy !== null} onClick={() => void download("json")}><DatabaseBackup className="h-4 w-4 text-[#0c8072]" /><span className="flex-1"><b className="block text-sm">完整备份 JSON</b><small className="text-xs text-muted">分类、公司、关系、证据、档案与备注</small></span><Download className="h-4 w-4" /></button>
          <button type="button" className="action-button flex min-h-12 items-center gap-3 px-3 text-left" disabled={busy !== null} onClick={() => void download("csv")}><FileSpreadsheet className="h-4 w-4 text-[#2675be]" /><span className="flex-1"><b className="block text-sm">关系矩阵 CSV</b><small className="text-xs text-muted">用于 Excel、筛选与分享</small></span><Download className="h-4 w-4" /></button>
        </div>
      </div>
    </details>
  );
}
