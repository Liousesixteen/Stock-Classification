export type ProviderCircuitState = "closed" | "open" | "half_open";

type CircuitRecord = {
  consecutiveFailures: number;
  openedAt: number | null;
  probeInFlight: boolean;
};

export type ProviderCircuitBreakerOptions = {
  failureThreshold?: number;
  cooldownMs?: number;
  now?: () => number;
};

export class ProviderCircuitBreaker {
  private readonly records = new Map<string, CircuitRecord>();
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(options: ProviderCircuitBreakerOptions = {}) {
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 3);
    this.cooldownMs = Math.max(1_000, options.cooldownMs ?? 60_000);
    this.now = options.now ?? Date.now;
  }

  begin(provider: string) {
    const record = this.records.get(provider);
    if (!record?.openedAt) {
      return { allowed: true, state: "closed" as const, retryAfterMs: 0 };
    }

    const elapsed = this.now() - record.openedAt;
    if (elapsed < this.cooldownMs) {
      return {
        allowed: false,
        state: "open" as const,
        retryAfterMs: this.cooldownMs - elapsed,
      };
    }

    if (record.probeInFlight) {
      return { allowed: false, state: "half_open" as const, retryAfterMs: this.cooldownMs };
    }

    record.probeInFlight = true;
    return { allowed: true, state: "half_open" as const, retryAfterMs: 0 };
  }

  succeed(provider: string) {
    this.records.delete(provider);
  }

  fail(provider: string) {
    const current = this.records.get(provider) ?? {
      consecutiveFailures: 0,
      openedAt: null,
      probeInFlight: false,
    };
    current.consecutiveFailures += 1;
    current.probeInFlight = false;
    if (current.consecutiveFailures >= this.failureThreshold) current.openedAt = this.now();
    this.records.set(provider, current);
    return this.snapshot(provider);
  }

  snapshot(provider: string) {
    const record = this.records.get(provider);
    if (!record) {
      return { state: "closed" as const, consecutiveFailures: 0, retryAfterMs: 0 };
    }
    const retryAfterMs = record.openedAt
      ? Math.max(0, this.cooldownMs - (this.now() - record.openedAt))
      : 0;
    const state: ProviderCircuitState = record.openedAt
      ? retryAfterMs > 0
        ? "open"
        : record.probeInFlight
          ? "half_open"
          : "open"
      : "closed";
    return {
      state,
      consecutiveFailures: record.consecutiveFailures,
      retryAfterMs,
    };
  }

  reset(provider?: string) {
    if (provider) this.records.delete(provider);
    else this.records.clear();
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const stockProviderCircuitBreaker = new ProviderCircuitBreaker({
  failureThreshold: positiveInteger(process.env.STOCK_PROVIDER_CIRCUIT_FAILURE_THRESHOLD, 3),
  cooldownMs: positiveInteger(process.env.STOCK_PROVIDER_CIRCUIT_COOLDOWN_MS, 60_000),
});
