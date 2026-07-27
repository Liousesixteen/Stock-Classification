import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { isOperationsRequestAuthorized } from "@/lib/operations/access";
import { listRecentAuditEvents } from "@/lib/operations/audit";
import { getMetricsSnapshot } from "@/lib/operations/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const checkedAt = new Date().toISOString();
  const detailsRequested = new URL(request.url).searchParams.get("details") === "1";
  const authorized = detailsRequested && isOperationsRequestAuthorized(request);
  try {
    const db = getDatabase();
    db.prepare("select 1").get();
    return NextResponse.json({
      status: "ok",
      checkedAt,
      database: "ready",
      dispatcher: process.env.STOCK_SYNC_DISPATCHER_ENABLED === "false" ? "disabled" : "enabled",
      ...(authorized ? {
        integrity: db.pragma("quick_check", { simple: true }),
        metrics: getMetricsSnapshot(),
        queue: db.prepare(
          `select status, count(*) as count from sync_tasks group by status order by status`,
        ).all(),
        recentAuditEvents: listRecentAuditEvents(db, 20),
      } : {}),
      ...(detailsRequested && !authorized ? { details: "unauthorized" } : {}),
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      status: "unavailable",
      checkedAt,
      database: "unavailable",
      error: authorized && error instanceof Error ? error.message : "health check failed",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
