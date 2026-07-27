import { describe, expect, it } from "vitest";
import { ProviderCircuitBreaker } from "@/lib/datasources/providerCircuitBreaker";

describe("provider circuit breaker", () => {
  it("opens after repeated failures and permits one half-open probe after cooldown", () => {
    let currentTime = 1_000;
    const breaker = new ProviderCircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 5_000,
      now: () => currentTime,
    });

    expect(breaker.begin("quote")).toMatchObject({ allowed: true, state: "closed" });
    expect(breaker.fail("quote")).toMatchObject({ state: "closed", consecutiveFailures: 1 });
    expect(breaker.fail("quote")).toMatchObject({ state: "open", consecutiveFailures: 2 });
    expect(breaker.begin("quote")).toMatchObject({ allowed: false, state: "open" });

    currentTime += 5_000;
    expect(breaker.begin("quote")).toMatchObject({ allowed: true, state: "half_open" });
    expect(breaker.begin("quote")).toMatchObject({ allowed: false, state: "half_open" });

    breaker.succeed("quote");
    expect(breaker.snapshot("quote")).toEqual({
      state: "closed",
      consecutiveFailures: 0,
      retryAfterMs: 0,
    });
  });
});
