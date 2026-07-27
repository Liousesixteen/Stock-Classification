type RouteMetric = {
  count: number;
  errorCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastStatus: number;
  lastSeenAt: string;
};

type MetricsState = {
  startedAt: string;
  routes: Map<string, RouteMetric>;
};

const globalMetrics = globalThis as typeof globalThis & { __stockOperationsMetrics?: MetricsState };

function getState() {
  if (!globalMetrics.__stockOperationsMetrics) {
    globalMetrics.__stockOperationsMetrics = { startedAt: new Date().toISOString(), routes: new Map() };
  }
  return globalMetrics.__stockOperationsMetrics;
}

export function recordRouteMetric(route: string, status: number, durationMs: number) {
  const state = getState();
  const current = state.routes.get(route) ?? {
    count: 0,
    errorCount: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    lastStatus: 0,
    lastSeenAt: "",
  };
  current.count += 1;
  current.errorCount += status >= 400 ? 1 : 0;
  current.totalDurationMs += durationMs;
  current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
  current.lastStatus = status;
  current.lastSeenAt = new Date().toISOString();
  state.routes.set(route, current);
}

export function getMetricsSnapshot() {
  const state = getState();
  return {
    startedAt: state.startedAt,
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssBytes: process.memoryUsage().rss,
      heapUsedBytes: process.memoryUsage().heapUsed,
    },
    routes: [...state.routes.entries()].map(([route, metric]) => ({
      route,
      count: metric.count,
      errorCount: metric.errorCount,
      errorRate: metric.count ? Number((metric.errorCount / metric.count).toFixed(4)) : 0,
      averageDurationMs: metric.count ? Math.round(metric.totalDurationMs / metric.count) : 0,
      maxDurationMs: Math.round(metric.maxDurationMs),
      lastStatus: metric.lastStatus,
      lastSeenAt: metric.lastSeenAt,
    })).sort((left, right) => left.route.localeCompare(right.route)),
  };
}
