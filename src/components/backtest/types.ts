/**
 * Backtest API type definitions
 * Mirrors api/v1/schemas/backtest.py
 */
import type { MarketPhaseSummary } from './phaseTypes';

// ============ Request / Response ============

export type BacktestAnalysisPhase = 'premarket' | 'intraday' | 'postmarket' | 'unknown';
export type BacktestPhaseFilter = BacktestAnalysisPhase | 'all';

export interface BacktestRunRequest {
  code?: string;
  force?: boolean;
  evalWindowDays?: number;
  minAgeDays?: number;
  limit?: number;
}

export interface BacktestRunResponse {
  processed: number;
  saved: number;
  completed: number;
  insufficient: number;
  errors: number;
}

export type StrategyKind = 'ma_cross' | 'momentum' | 'buy_hold';

export interface StrategyBacktestRequest {
  code: string;
  startDate: string;
  endDate: string;
  strategy: StrategyKind;
  fastPeriod: number;
  slowPeriod: number;
  initialCapital: number;
  commissionBps: number;
  slippageBps: number;
  sellTaxBps: number;
}

export interface StrategyBacktestResponse {
  runId: string;
  createdAt: string;
  request: StrategyBacktestRequest;
  summary: {
    initialCapital: number;
    finalEquity: number;
    totalReturnPct: number;
    benchmarkReturnPct: number;
    excessReturnPct: number;
    annualizedReturnPct: number;
    annualizedVolatilityPct: number;
    maxDrawdownPct: number;
    sharpeRatio?: number | null;
    completedTrades: number;
    winRatePct?: number | null;
    profitFactor?: number | null;
    positionAtEnd: 'long' | 'cash';
    bars: number;
  };
  equityCurve: Array<{ date: string; equity: number; strategyReturnPct: number; benchmarkReturnPct: number }>;
  orders: Array<{ date: string; side: 'buy' | 'sell'; price: number; shares: number; fee: number; tax: number }>;
  dataMeta: { source: string; adjustment: string; symbol: string; asOf: string; fetchedAt: string; firstBar: string; lastBar: string; barCount: number; fallback?: boolean };
  methodology: Record<string, string>;
}

// ============ Result Item ============

export interface BacktestResultItem {
  analysisHistoryId: number;
  code: string;
  stockName?: string;
  analysisDate?: string;
  evalWindowDays: number;
  engineVersion: string;
  evalStatus: string;
  evaluatedAt?: string;
  operationAdvice?: string;
  trendPrediction?: string;
  marketPhase?: string | null;
  marketPhaseSummary?: MarketPhaseSummary | null;
  positionRecommendation?: string;
  startPrice?: number;
  endClose?: number;
  maxHigh?: number;
  minLow?: number;
  stockReturnPct?: number;
  actualReturnPct?: number;
  actualMovement?: string;
  directionExpected?: string;
  directionCorrect?: boolean;
  outcome?: string;
  stopLoss?: number;
  takeProfit?: number;
  hitStopLoss?: boolean;
  hitTakeProfit?: boolean;
  firstHit?: string;
  firstHitDate?: string;
  firstHitTradingDays?: number;
  simulatedEntryPrice?: number;
  simulatedExitPrice?: number;
  simulatedExitReason?: string;
  simulatedReturnPct?: number;
}

export interface BacktestResultsResponse {
  total: number;
  page: number;
  limit: number;
  items: BacktestResultItem[];
}

// ============ Performance Metrics ============

export interface PerformanceMetrics {
  scope: string;
  code?: string;
  evalWindowDays: number;
  engineVersion: string;
  computedAt?: string;

  totalEvaluations: number;
  completedCount: number;
  insufficientCount: number;
  longCount: number;
  cashCount: number;
  winCount: number;
  lossCount: number;
  neutralCount: number;

  directionAccuracyPct?: number;
  winRatePct?: number;
  neutralRatePct?: number;
  avgStockReturnPct?: number;
  avgSimulatedReturnPct?: number;

  stopLossTriggerRate?: number;
  takeProfitTriggerRate?: number;
  ambiguousRate?: number;
  avgDaysToFirstHit?: number;

  adviceBreakdown: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
}
