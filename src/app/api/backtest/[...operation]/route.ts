import { NextResponse } from "next/server";
import { executeBacktest } from "@/lib/backtest/daStockBacktest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request, context: { params: Promise<{ operation: string[] }> }) {
  const { operation } = await context.params;
  const url = new URL(request.url);
  try {
    if (operation[0] === "results" && operation.length === 1) {
      return NextResponse.json(await executeBacktest("results", filters(url.searchParams)));
    }
    if (operation[0] === "performance") {
      const input = filters(url.searchParams);
      if (operation[1]) input.code = normalizedCode(operation[1]);
      const result = await executeBacktest("performance", input);
      return result ? NextResponse.json(result) : NextResponse.json({ error: "暂无回测汇总" }, { status: 404 });
    }
    return NextResponse.json({ error: "回测接口不存在" }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ operation: string[] }> }) {
  const { operation } = await context.params;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (operation.join("/") === "strategy") {
      const start = requiredDate(body.start_date, "开始日期");
      const end = requiredDate(body.end_date, "结束日期");
      if (start >= end) throw new Error("开始日期必须早于结束日期");
      const strategy = String(body.strategy || "ma_cross");
      if (!["ma_cross", "momentum", "buy_hold"].includes(strategy)) throw new Error("无效的策略类型");
      return NextResponse.json(await executeBacktest("strategy", {
        code: normalizedCode(String(body.code || "")), start_date: start, end_date: end, strategy,
        fast_period: optionalInteger(body.fast_period, 2, 120) ?? 10,
        slow_period: optionalInteger(body.slow_period, 3, 250) ?? 30,
        initial_capital: optionalNumber(body.initial_capital, 10000, 1000000000) ?? 100000,
        commission_bps: optionalNumber(body.commission_bps, 0, 100) ?? 3,
        slippage_bps: optionalNumber(body.slippage_bps, 0, 100) ?? 2,
        sell_tax_bps: optionalNumber(body.sell_tax_bps, 0, 100) ?? 5,
      }));
    }
    if (operation.join("/") !== "run") return NextResponse.json({ error: "回测接口不存在" }, { status: 404 });
    const input = {
      code: body.code ? normalizedCode(String(body.code)) : undefined,
      force: Boolean(body.force),
      eval_window_days: optionalInteger(body.eval_window_days, 1, 120),
      min_age_days: optionalInteger(body.min_age_days, 0, 365),
      limit: optionalInteger(body.limit, 1, 2000) ?? 200,
    };
    return NextResponse.json(await executeBacktest("run", input));
  } catch (error) {
    return failure(error);
  }
}

function filters(params: URLSearchParams): Record<string, unknown> {
  const phase = params.get("analysis_phase");
  if (phase && !["premarket", "intraday", "postmarket", "unknown"].includes(phase)) throw new Error("无效的分析阶段");
  const from = optionalDate(params.get("analysis_date_from"));
  const to = optionalDate(params.get("analysis_date_to"));
  if (from && to && from > to) throw new Error("开始日期不能晚于结束日期");
  return {
    code: params.get("code") ? normalizedCode(params.get("code")!) : undefined,
    eval_window_days: optionalInteger(params.get("eval_window_days"), 1, 120),
    analysis_date_from: from, analysis_date_to: to, analysis_phase: phase || undefined,
    page: optionalInteger(params.get("page"), 1, 100000) ?? 1,
    limit: optionalInteger(params.get("limit"), 1, 200) ?? 20,
  };
}

function normalizedCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9.]{1,20}$/.test(code)) throw new Error("股票代码格式无效");
  return code;
}
function optionalInteger(value: unknown, min: number, max: number) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error("回测参数超出范围");
  return number;
}
function optionalDate(value: string | null) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("日期格式无效");
  return value;
}
function requiredDate(value: unknown, label: string) {
  const parsed = optionalDate(typeof value === "string" ? value : null);
  if (!parsed) throw new Error(`${label}格式无效`);
  return parsed;
}
function optionalNumber(value: unknown, min: number, max: number) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error("回测参数超出范围");
  return number;
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "回测请求失败";
  const badRequest = /无效|不能|超出|格式/.test(message);
  return NextResponse.json({ error: message, message }, { status: badRequest ? 400 : 503 });
}
