import type { BacktestRunRequest, BacktestRunResponse, BacktestResultsResponse, PerformanceMetrics, BacktestPhaseFilter, StrategyBacktestRequest, StrategyBacktestResponse } from "./types";
type Filters = { code?: string; evalWindowDays?: number; analysisDateFrom?: string; analysisDateTo?: string; analysisPhase?: BacktestPhaseFilter; page?: number; limit?: number };
function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), camelize(item)]));
  return value;
}
function query(params: Filters) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "" && value !== "all") q.set(key.replace(/[A-Z]/g, c => "_" + c.toLowerCase()), String(value));
  return q.toString();
}
async function request<T>(path: string, init?: RequestInit, allowMissing = false): Promise<T> {
  const response = await fetch("/api/backtest/" + path, { cache: "no-store", ...init });
  const data = await response.json();
  if (allowMissing && response.status === 404) return null as T;
  if (!response.ok) throw new Error(data.message || data.error || "回测请求失败");
  return camelize(data) as T;
}
export const backtestApi = {
  runStrategy: (params: StrategyBacktestRequest) => request<StrategyBacktestResponse>("strategy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(Object.entries(params).map(([key, value]) => [key.replace(/[A-Z]/g, c => "_" + c.toLowerCase()), value]))) }),
  run: (params: BacktestRunRequest = {}) => request<BacktestRunResponse>("run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(Object.entries(params).map(([key, value]) => [key.replace(/[A-Z]/g, c => "_" + c.toLowerCase()), value]))) }),
  getResults: (params: Filters = {}) => request<BacktestResultsResponse>("results?" + query(params)),
  getOverallPerformance: (params: Filters = {}) => request<PerformanceMetrics | null>("performance?" + query(params), undefined, true),
  getStockPerformance: (code: string, params: Filters = {}) => request<PerformanceMetrics | null>("performance/" + encodeURIComponent(code) + "?" + query(params), undefined, true),
};
