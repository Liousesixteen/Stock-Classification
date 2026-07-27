import { NextResponse } from "next/server";
import { isOperationsRequestAuthorized } from "@/lib/operations/access";
import { getMetricsSnapshot } from "@/lib/operations/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isOperationsRequestAuthorized(request)) {
    return NextResponse.json({ error: "无权读取运行指标" }, { status: 401 });
  }
  return NextResponse.json(getMetricsSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
