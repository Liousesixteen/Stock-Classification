"use client";

import { Activity } from "lucide-react";

export type MarketTickerMarket = { name: string; value: string; change: string; tone: "up" | "down" | "neutral" };

export function GlobalMarketTicker({ markets = [] }: { markets?: MarketTickerMarket[] }) {
  if (!markets.length) return null;
  const stream = [...markets, ...markets];

  return (
    <section className="global-market-ticker" aria-label="市场指数行情">
      <div className="market-ticker-label"><Activity aria-hidden="true" /><span>市场行情</span><b>LIVE SOURCE</b></div>
      <div className="market-ticker-viewport">
        <div className="market-ticker-track">
          {stream.map((market, index) => (
            <div className="market-ticker-item" key={`${market.name}-${index}`} aria-hidden={index >= markets.length}>
              <span>{market.name}</span><b>{market.value}</b><em className={market.tone}>{market.change}</em>
            </div>
          ))}
        </div>
      </div>
      <div className="market-ticker-status is-demo"><i />演示行情 · 非实时</div>
    </section>
  );
}
