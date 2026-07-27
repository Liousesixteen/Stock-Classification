import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { commitImportRows } from "@/lib/import/commit";
import { importCommitSchema } from "@/lib/import/preview";
import { withApiObservability } from "@/lib/operations/observability";

async function commitImport(request: Request) {
  const parsed = importCommitSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "导入数据格式无效" },
      { status: 400 },
    );
  }

  const db = getDatabase();
  return NextResponse.json(commitImportRows(db, parsed.data.rows));
}

export const POST = withApiObservability("workspace.import.commit", commitImport, { audit: true });
