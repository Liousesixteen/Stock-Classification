import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { commitImportRows } from "@/lib/import/commit";
import type { ValidImportRow } from "@/lib/import/preview";

export async function POST(request: Request) {
  const body = (await request.json()) as { rows?: ValidImportRow[] };

  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "导入数据格式无效" }, { status: 400 });
  }

  const db = getDatabase();
  return NextResponse.json(commitImportRows(db, body.rows));
}
