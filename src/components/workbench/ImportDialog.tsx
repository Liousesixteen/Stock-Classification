"use client";

import { Upload } from "lucide-react";
import { useState } from "react";

type ValidImportRow = {
  stockCode: string;
  shortName: string;
  categoryId: number;
  categoryPath: string[];
  relationType: string;
  confidence: string;
  rationale: string;
  sourceType: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceDate: string;
  sourceExcerpt: string;
  intro: string;
  note: string;
};

type ImportPreview = {
  validRows: ValidImportRow[];
  errors: Array<{ rowNumber: number; messages: string[] }>;
  unknownCategories: string[];
  duplicateKeys: string[];
};

type ImportDialogProps = {
  onImported: () => void;
};

export function ImportDialog({ onImported }: ImportDialogProps) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) return;
    setIsBusy(true);
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/import/preview", { method: "POST", body: formData });
    const payload = (await response.json()) as ImportPreview;
    setPreview(payload);
    setIsBusy(false);
  }

  async function commitRows() {
    if (!preview || preview.validRows.length === 0) return;
    setIsBusy(true);
    const response = await fetch("/api/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: preview.validRows }),
    });
    const payload = (await response.json()) as {
      companiesUpserted: number;
      relationsUpserted: number;
      evidencesCreated: number;
      notesCreated: number;
    };
    setMessage(`已导入 ${payload.relationsUpserted} 条关系，新增 ${payload.evidencesCreated} 条证据。`);
    setPreview(null);
    setIsBusy(false);
    onImported();
  }

  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-muted">数据导入</div>
          <h2 className="mt-1 text-lg font-semibold">Excel / CSV 分类导入</h2>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white">
          <Upload className="h-4 w-4" />
          选择文件
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0] ?? null)} />
        </label>
      </div>

      {message ? <div className="mb-3 rounded-md bg-[#e9f5ee] px-3 py-2 text-sm text-[#173326]">{message}</div> : null}
      {isBusy ? <div className="text-sm text-muted">处理中...</div> : null}

      {preview ? (
        <div className="grid gap-3">
          <div className="text-sm text-muted">
            可导入 {preview.validRows.length} 行，错误 {preview.errors.length} 行
          </div>
          {preview.errors.length > 0 ? (
            <div className="max-h-32 overflow-auto rounded-md border border-line bg-panel p-2 text-xs text-slate-700">
              {preview.errors.map((error) => (
                <div key={error.rowNumber}>
                  第 {error.rowNumber} 行：{error.messages.join("、")}
                </div>
              ))}
            </div>
          ) : null}
          <div className="max-h-44 overflow-auto rounded-md border border-line">
            {preview.validRows.map((row, index) => (
              <div key={`${row.stockCode}-${row.categoryId}-${index}`} className="grid grid-cols-[90px_110px_1fr_80px] border-b border-slate-100 px-3 py-2 text-xs">
                <span>{row.stockCode}</span>
                <span>{row.shortName}</span>
                <span className="truncate">{row.categoryPath.join(" / ")}</span>
                <span>{row.confidence}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void commitRows()}
            disabled={preview.validRows.length === 0 || isBusy}
            className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            提交导入
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">字段支持股票代码、公司简称、分类路径、关系类型、确信度、来源和研究备注。</p>
      )}
    </section>
  );
}
