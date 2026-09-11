import { NextResponse } from "next/server";
import { executeBacktest } from "@/lib/backtest/daStockBacktest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const code = String(body.code || "").trim().toUpperCase();
    if (!/^(?:SH|SZ|BJ)?\d{6}$/.test(code)) throw new Error("股票代码格式无效");
    const start = requiredDate(body.startDate ?? body.start_date, "开始日期");
    const end = requiredDate(body.endDate ?? body.end_date, "结束日期");
    if (start >= end) throw new Error("开始日期必须早于结束日期");
    const reversal = Number(body.reversalPct ?? body.reversal_pct ?? 5);
    if (!Number.isFinite(reversal) || reversal < 2 || reversal > 20) throw new Error("转折阈值应在 2%–20% 之间");
    return NextResponse.json(await executeBacktest("wave", { code, start_date: start, end_date: end, reversal_pct: reversal }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "波浪分析失败";
    const badRequest = /无效|必须|应在|不足/.test(message);
    return NextResponse.json({ error: message, message }, { status: badRequest ? 400 : 503 });
  }
}

function requiredDate(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label}格式无效`);
  return value;
}
