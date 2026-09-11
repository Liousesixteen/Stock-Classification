"use client";
import React, { useState } from "react";
import { Activity, FlaskConical, Orbit, RefreshCw, Waves } from "lucide-react";
import BacktestPage from "@/components/backtest/BacktestPage";
import WaveTheoryWorkspace from "@/components/technical-analysis/WaveTheoryWorkspace";

export function RichWorkbenchWorkspace({ onOpenAtlas }: { onOpenAtlas?: () => void }) {
  const [view, setView] = useState<"market" | "backtest" | "wave">("market");
  const [loaded, setLoaded] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [openedBacktest, setOpenedBacktest] = useState(false);
  const [openedWave, setOpenedWave] = useState(false);
  return <section className="integrated-desk" aria-label="市场工作台">
    <div className="integrated-desk-tabs">
      <div role="tablist" aria-label="工作台视图">
        <button role="tab" id="desk-market-tab" aria-selected={view === "market"} aria-controls="desk-market" onClick={() => setView("market")}><Activity />市场观察</button>
        <button role="tab" id="desk-backtest-tab" aria-selected={view === "backtest"} aria-controls="desk-backtest" onClick={() => { setOpenedBacktest(true); setView("backtest"); }}><FlaskConical />策略回测</button>
        <button role="tab" id="desk-wave-tab" aria-selected={view === "wave"} aria-controls="desk-wave" onClick={() => { setOpenedWave(true); setView("wave"); }}><Waves />波浪理论</button>
      </div>
      {onOpenAtlas && <button className="desk-atlas-link" onClick={onOpenAtlas}><Orbit />星图</button>}
    </div>
    <div id="desk-market" role="tabpanel" aria-labelledby="desk-market-tab" className="integrated-market" hidden={view !== "market"}>
      {!loaded && <div className="desk-loading" role="status">正在载入市场工作台…</div>}
      <iframe key={frameKey} src="/rich-workbench" title="Yidianx 股票与基金工作台" onLoad={() => setLoaded(true)} />
      {!loaded && <button className="desk-retry" onClick={() => setFrameKey(key => key + 1)}><RefreshCw />重新连接</button>}
    </div>
    <div id="desk-backtest" role="tabpanel" aria-labelledby="desk-backtest-tab" className="integrated-backtest" hidden={view !== "backtest"}>{openedBacktest && <BacktestPage />}</div>
    <div id="desk-wave" role="tabpanel" aria-labelledby="desk-wave-tab" className="integrated-technical" hidden={view !== "wave"}>{openedWave && <WaveTheoryWorkspace />}</div>
  </section>;
}
