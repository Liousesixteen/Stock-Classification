import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { lookupStockProfile } from "@/lib/datasources/stockLookup";
import { stockCodeSchema } from "@/lib/domain/schemas";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const parsed = stockCodeSchema.safeParse(code);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "股票代码无效" }, { status: 400 });
  }

  try {
    const profile = await lookupStockProfile(parsed.data);
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "股票基础资料查询失败";
    return NextResponse.json({ error: message }, { status: message.includes("未查询到") ? 404 : 502 });
  }
}
