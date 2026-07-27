import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { listRecentAuditEvents, recordAuditEvent } from "@/lib/operations/audit";
import { getMetricsSnapshot, recordRouteMetric } from "@/lib/operations/metrics";

describe("operations observability", () => {
  it("persists bounded audit events and redacts secret-shaped metadata", () => {
    const db = new Database(":memory:");
    migrate(db);
    recordAuditEvent(db, {
      requestId: "request-1",
      actor: "analyst",
      action: "ai.research.run",
      target: "/api/ai/research",
      method: "POST",
      statusCode: 201,
      durationMs: 42.6,
      metadata: { stockCode: "600030", apiKey: "must-not-be-stored", nested: { value: "hidden" } },
    });

    const event = listRecentAuditEvents(db, 1)[0] as {
      requestId: string;
      outcome: string;
      durationMs: number;
      metadataJson: string;
    };
    expect(event).toMatchObject({ requestId: "request-1", outcome: "success", durationMs: 43 });
    expect(JSON.parse(event.metadataJson)).toEqual({
      stockCode: "600030",
      apiKey: "[REDACTED]",
      nested: "[COMPLEX_VALUE]",
    });
  });

  it("aggregates route latency and error rates without request payloads", () => {
    const route = `test.route.${Date.now()}`;
    recordRouteMetric(route, 200, 20);
    recordRouteMetric(route, 502, 60);
    const metric = getMetricsSnapshot().routes.find((item) => item.route === route);
    expect(metric).toMatchObject({
      count: 2,
      errorCount: 1,
      errorRate: 0.5,
      averageDurationMs: 40,
      maxDurationMs: 60,
      lastStatus: 502,
    });
  });
});
