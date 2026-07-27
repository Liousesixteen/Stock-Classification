import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { companyNoteInputSchema, stockCodeSchema } from "@/lib/domain/schemas";
import { getCompany } from "@/lib/repositories/companies";
import { upsertCompanyNote } from "@/lib/repositories/notes";
import { withApiObservability } from "@/lib/operations/observability";

type RouteContext = {
  params: Promise<{ code: string }>;
};

async function patchCompanyNote(request: NextRequest, context: RouteContext) {
  const { code } = await context.params;
  const parsedCode = stockCodeSchema.safeParse(code);
  if (!parsedCode.success) {
    return NextResponse.json({ error: parsedCode.error.issues[0]?.message ?? "股票代码无效" }, { status: 400 });
  }

  const parsed = companyNoteInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "备注内容无效" }, { status: 400 });
  }

  const db = getDatabase();
  if (!getCompany(db, parsedCode.data)) {
    return NextResponse.json({ error: "公司不存在" }, { status: 404 });
  }

  const note = upsertCompanyNote(db, {
    stockCode: parsedCode.data,
    noteType: "我的备注",
    content: parsed.data.content,
    tags: ["user"],
  });

  return NextResponse.json({ note });
}

export const PATCH = withApiObservability("company.note.update", patchCompanyNote, { audit: true });
