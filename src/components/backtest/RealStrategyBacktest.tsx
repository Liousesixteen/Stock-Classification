"use client";

import { useMemo, useState } from "react";
import { Activity, Database, Play, ShieldCheck } from "lucide-react";
import { backtestApi } from "./api";
import type { StrategyBacktestRequest, StrategyBacktestResponse, StrategyKind } from "./types";

const inputClass = "real-bt-input";

function isoDate(offsetYears = 0) {
  const value = new Date();
  value.setFullYear(value.getFullYear() + offsetYears);
  return value.toISOString().slice(0, 10);
}

function valueText(value: number | null | undefined, suffix = "%") {
  return value == null ? "—" : `${value > 0 && suffix === "%" ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

function EquityChart({ result }: { result: StrategyBacktestResponse }) {
  const model = useMemo(() => {
    const rows = result.equityCurve;
    const width = 900, height = 250, pad = 24;
    const values = rows.flatMap(row => [row.strategyReturnPct, row.benchmarkReturnPct]);
    const low = Math.min(0, ...values), high = Math.max(0, ...values);
    const span = high - low || 1;
    const line = (key: "strategyReturnPct" | "benchmarkReturnPct") => rows.map((row, index) => {
      const x = pad + index / Math.max(rows.length - 1, 1) * (width - pad * 2);
      const y = height - pad - (row[key] - low) / span * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const zeroY = height - pad - (0 - low) / span * (height - pad * 2);
    return { width, height, strategy: line("strategyReturnPct"), benchmark: line("benchmarkReturnPct"), zeroY, low, high };
  }, [result]);
  return <div className="real-bt-chart-wrap">
    <div className="real-bt-section-head"><div><span>净值轨迹</span><small>{result.dataMeta.firstBar} — {result.dataMeta.lastBar}</small></div><div className="real-bt-legend"><i className="strategy" />策略<i className="benchmark" />买入持有</div></div>
    <svg className="real-bt-chart" viewBox={`0 0 ${model.width} ${model.height}`} role="img" aria-label="策略与买入持有收益曲线">
      <defs><linearGradient id="strategy-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#51d5eb" stopOpacity=".22"/><stop offset="1" stopColor="#51d5eb" stopOpacity="0"/></linearGradient></defs>
      <line x1="24" x2="876" y1={model.zeroY} y2={model.zeroY} className="real-bt-zero" />
      <polyline points={model.benchmark} className="real-bt-line benchmark" />
      <polyline points={model.strategy} className="real-bt-line strategy" />
      <text x="24" y="16" className="real-bt-axis">{model.high.toFixed(1)}%</text>
      <text x="24" y="242" className="real-bt-axis">{model.low.toFixed(1)}%</text>
    </svg>
  </div>;
}

export default function RealStrategyBacktest() {
  const [form, setForm] = useState<StrategyBacktestRequest>({
    code: "600519", startDate: isoDate(-2), endDate: isoDate(), strategy: "ma_cross",
    fastPeriod: 10, slowPeriod: 30, initialCapital: 1000000,
    commissionBps: 3, slippageBps: 2, sellTaxBps: 5,
  });
  const [result, setResult] = useState<StrategyBacktestResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const update = <K extends keyof StrategyBacktestRequest>(key: K, value: StrategyBacktestRequest[K]) => setForm(previous => ({ ...previous, [key]: value }));
  const run = async () => {
    setRunning(true); setError("");
    try { setResult(await backtestApi.runStrategy(form)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "回测执行失败"); }
    finally { setRunning(false); }
  };
  const metrics = result ? [
    ["累计收益", result.summary.totalReturnPct, "return"], ["基准收益", result.summary.benchmarkReturnPct, "return"],
    ["超额收益", result.summary.excessReturnPct, "return"], ["最大回撤", result.summary.maxDrawdownPct, "risk"],
    ["年化收益", result.summary.annualizedReturnPct, "return"], ["Sharpe", result.summary.sharpeRatio, "ratio"],
  ] as const : [];

  return <div className="real-bt-shell">
    <aside className="real-bt-config">
      <div className="real-bt-title"><Activity /><div><strong>真实策略回测</strong><span>REAL EXECUTION MODEL</span></div></div>
      <label>股票代码<input className={inputClass} value={form.code} maxLength={8} onChange={event => update("code", event.target.value.toUpperCase())} /></label>
      <div className="real-bt-form-grid">
        <label>开始日期<input className={inputClass} type="date" value={form.startDate} onChange={event => update("startDate", event.target.value)} /></label>
        <label>结束日期<input className={inputClass} type="date" value={form.endDate} onChange={event => update("endDate", event.target.value)} /></label>
      </div>
      <label>策略<select className={inputClass} value={form.strategy} onChange={event => update("strategy", event.target.value as StrategyKind)}><option value="ma_cross">双均线趋势</option><option value="momentum">动量趋势过滤</option><option value="buy_hold">买入并持有</option></select></label>
      <div className="real-bt-form-grid">
        <label>短周期<input className={inputClass} type="number" min="2" max="120" value={form.fastPeriod} disabled={form.strategy === "buy_hold"} onChange={event => update("fastPeriod", Number(event.target.value))} /></label>
        <label>长周期<input className={inputClass} type="number" min="3" max="250" value={form.slowPeriod} disabled={form.strategy === "buy_hold"} onChange={event => update("slowPeriod", Number(event.target.value))} /></label>
      </div>
      <label>初始资金（元）<input className={inputClass} type="number" min="10000" step="10000" value={form.initialCapital} onChange={event => update("initialCapital", Number(event.target.value))} /></label>
      <div className="real-bt-costs">
        <span>成本模型 <small>1 bp = 0.01%</small></span>
        <div className="real-bt-form-grid triple">
          <label>佣金<input className={inputClass} type="number" min="0" max="100" value={form.commissionBps} onChange={event => update("commissionBps", Number(event.target.value))} /></label>
          <label>滑点<input className={inputClass} type="number" min="0" max="100" value={form.slippageBps} onChange={event => update("slippageBps", Number(event.target.value))} /></label>
          <label>卖出税<input className={inputClass} type="number" min="0" max="100" value={form.sellTaxBps} onChange={event => update("sellTaxBps", Number(event.target.value))} /></label>
        </div>
      </div>
      <button className="real-bt-run" onClick={run} disabled={running}><Play />{running ? "正在读取真实行情…" : "运行策略回测"}</button>
      <p className="real-bt-integrity"><ShieldCheck />收盘产生信号，下一交易日开盘成交；不使用未来数据。</p>
      {error ? <div className="bt-error">{error}</div> : null}
    </aside>

    <main className="real-bt-output">
      {!result ? <div className="real-bt-welcome"><Database /><strong>等待真实行情回测</strong><p>设定标的、区间和成本后运行。系统不会用演示数据填充结果。</p><div><span>前复权日线</span><span>100 股整数手</span><span>逐日净值</span><span>可复现记录</span></div></div> : <>
        <div className="real-bt-result-head">
          <div><span className="label-uppercase">RUN / {result.runId}</span><h3>{result.request.code} · {result.request.strategy === "ma_cross" ? `${result.request.fastPeriod}/${result.request.slowPeriod} 双均线` : result.request.strategy === "momentum" ? "动量趋势过滤" : "买入并持有"}</h3></div>
          <div className="real-bt-source"><Database /><span>{result.dataMeta.source}<small>{result.dataMeta.adjustment} · 截至 {result.dataMeta.asOf}</small></span></div>
        </div>
        <section className="real-bt-metrics">{metrics.map(([label, value, kind]) => <article key={label}><span>{label}</span><strong className={kind === "risk" ? "risk" : value != null && value < 0 ? "negative" : ""}>{kind === "ratio" ? valueText(value, "") : valueText(value)}</strong></article>)}</section>
        <EquityChart result={result} />
        <div className="real-bt-lower">
          <section className="real-bt-panel"><div className="real-bt-section-head"><div><span>成交流水</span><small>{result.summary.completedTrades} 笔完整交易 · 期末{result.summary.positionAtEnd === "long" ? "持仓" : "空仓"}</small></div></div>
            <div className="real-bt-orders"><table><thead><tr><th>日期</th><th>方向</th><th>成交价</th><th>股数</th><th>费用</th></tr></thead><tbody>{result.orders.length ? result.orders.map((order, index) => <tr key={`${order.date}-${index}`}><td>{order.date}</td><td className={order.side}>{order.side === "buy" ? "买入" : "卖出"}</td><td>{order.price.toFixed(2)}</td><td>{order.shares.toLocaleString()}</td><td>{(order.fee + order.tax).toFixed(2)}</td></tr>) : <tr><td colSpan={5}>区间内没有产生交易信号</td></tr>}</tbody></table></div>
          </section>
          <section className="real-bt-panel methodology"><div className="real-bt-section-head"><div><span>模型口径</span><small>{result.summary.bars} 个有效交易日</small></div></div>{Object.values(result.methodology).map(item => <p key={item}>{item}</p>)}<dl><div><dt>期末净值</dt><dd>¥{result.summary.finalEquity.toLocaleString()}</dd></div><div><dt>胜率</dt><dd>{valueText(result.summary.winRatePct)}</dd></div><div><dt>盈亏比</dt><dd>{valueText(result.summary.profitFactor, "")}</dd></div></dl></section>
        </div>
      </>}
    </main>
  </div>;
}
