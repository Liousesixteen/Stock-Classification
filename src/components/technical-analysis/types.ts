export type WavePoint = {
  index: number;
  date: string;
  price: number;
  kind: "high" | "low";
  label: string;
};

export type WaveAnalysisResult = {
  createdAt: string;
  request: { code: string; startDate: string; endDate: string; reversalPct: number };
  series: Array<{ date: string; close: number }>;
  pivots: WavePoint[];
  allPivotCount: number;
  bias: "bullish" | "bearish";
  currentStage: string;
  stageNote: string;
  confidenceScore: number;
  confidenceLabel: "高" | "中" | "低";
  rules: Array<{ id: string; label: string; passed: boolean | null }>;
  levels: Array<{ label: string; price: number; kind: "support" | "resistance" | "target" }>;
  dataMeta: {
    provider?: string;
    source?: string;
    adjustment?: string;
    symbol: string;
    firstBar: string;
    lastBar: string;
    barCount: number;
    cacheHit?: boolean;
  };
  disclaimer: string;
};
