"use client";

import { Activity } from "lucide-react";

const MARKETS = [
  { name: "上证指数", value: "3,274.42", change: "+0.36%", tone: "up" },
  { name: "沪深300", value: "3,856.91", change: "+0.28%", tone: "up" },
  { name: "恒生指数", value: "19,912.61", change: "-0.14%", tone: "down" },
  { name: "日经225", value: "39,646.36", change: "+0.61%", tone: "up" },
  { name: "纳斯达克", value: "18,398.45", change: "+0.24%", tone: "up" },
  { name: "标普500", value: "5,615.35", change: "-0.08%", tone: "down" },
  { name: "德国DAX", value: "18,432.12", change: "+0.18%", tone: "up" },
  { name: "WTI 原油", value: "78.43", change: "-0.42%", tone: "down" },
];

export function GlobalMarketTicker() {
  const stream = [...MARKETS, ...MARKETS];

  return (
    <section className="global-market-ticker" aria-label="全球市场指数">
      <div className="market-ticker-label"><Activity aria-hidden="true" /><span>市场行情</span><b>GLOBAL MARKETS</b></div>
      <div className="market-ticker-viewport">
        <div className="market-ticker-track">
          {stream.map((market, index) => (
            <div className="market-ticker-item" key={`${market.name}-${index}`}>
              <span>{market.name}</span><b>{market.value}</b><em className={market.tone}>{market.change}</em>
            </div>
          ))}
        </div>
      </div>
      <div className="market-ticker-status"><i />数据正常</div>
    </section>
  );
}
