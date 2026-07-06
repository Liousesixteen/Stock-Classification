import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { parseWorkbook } from "@/lib/import/parse";
import { previewImportRows } from "@/lib/import/preview";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传 Excel 或 CSV 文件" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const rows = parseWorkbook(buffer);
  const db = getDatabase();

  return NextResponse.json(previewImportRows(db, rows));
}
