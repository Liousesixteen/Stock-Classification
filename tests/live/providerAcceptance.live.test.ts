import { describe, expect, it } from "vitest";
import { runProviderAcceptance } from "@/lib/datasources/providerAcceptance";

const live = process.env.RUN_LIVE_PROVIDER_TESTS === "1";

describe.skipIf(!live)("live stock provider acceptance", () => {
  it("keeps the cross-industry sample set above the provider availability baseline", async () => {
    const report = await runProviderAcceptance({
      concurrency: 3,
      timeoutMs: 6_000,
    });
    console.table(
      report.results.map((result) => ({
        code: result.code,
        name: result.resolvedName || result.name,
        sector: result.sector,
        latencyMs: result.latencyMs,
        providers: result.successfulProviders,
        failed: result.failedProviders.join(","),
        missing: result.missingCoreFields.join(","),
        passed: result.passed,
      })),
    );
    console.info({
      total: report.total,
      passed: report.passed,
      passRate: report.passRate,
      p50LatencyMs: report.p50LatencyMs,
      p95LatencyMs: report.p95LatencyMs,
    });

    expect(report.total).toBeGreaterThanOrEqual(20);
    expect(report.passRate).toBeGreaterThanOrEqual(0.8);
  }, 180_000);
});
