import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { parseWorkbook } from "@/lib/import/parse";
import { previewImportRows } from "@/lib/import/preview";
import { withApiObservability } from "@/lib/operations/observability";

async function previewImport(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "上传请求格式无效" }, { status: 400 });
  }
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传 Excel 或 CSV 文件" }, { status: 400 });
  }
  const maxBytes = Number(process.env.STOCK_IMPORT_MAX_BYTES) || 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `导入文件不能超过 ${Math.ceil(maxBytes / 1024 / 1024)} MB` }, { status: 413 });
  }

  let rows;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    rows = parseWorkbook(buffer);
  } catch {
    return NextResponse.json({ error: "无法解析该 Excel 或 CSV 文件" }, { status: 400 });
  }
  if (rows.length > 5_000) {
    return NextResponse.json({ error: "单次最多导入 5000 行" }, { status: 413 });
  }
  const db = getDatabase();

  return NextResponse.json(previewImportRows(db, rows));
}

export const POST = withApiObservability("workspace.import.preview", previewImport);
