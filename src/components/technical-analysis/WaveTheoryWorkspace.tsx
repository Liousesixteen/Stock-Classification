"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, Check, Database, Play, RotateCcw, ShieldCheck, Waves, X } from "lucide-react";
import type { WaveAnalysisResult } from "./types";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function initialDates() {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 2);
  return { start: isoDate(start), end: isoDate(end) };
}

function WaveChart({ result }: { result: WaveAnalysisResult }) {
  const geometry = useMemo(() => {
    const width = 1000;
    const height = 340;
    const left = 48;
    const right = 72;
    const top = 28;
    const bottom = 34;
    const values = [...result.series.map(item => item.close), ...result.levels.map(item => item.price)];
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const pad = Math.max((rawMax - rawMin) * 0.1, rawMax * 0.01);
    const min = rawMin - pad;
    const max = rawMax + pad;
    const x = (index: number) => left + index / Math.max(result.series.length - 1, 1) * (width - left - right);
    const y = (price: number) => top + (max - price) / Math.max(max - min, 1) * (height - top - bottom);
    const closePath = result.series.map((item, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(item.close).toFixed(1)}`).join(" ");
    const wavePath = result.pivots.map((point, index) => `${index ? "L" : "M"}${x(point.index).toFixed(1)},${y(point.price).toFixed(1)}`).join(" ");
    const ticks = Array.from({ length: 5 }, (_, index) => max - index * (max - min) / 4);
    return { width, height, left, right, top, bottom, x, y, closePath, wavePath, ticks };
  }, [result]);

  return <svg className="wave-chart" viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label="真实日线与波浪候选归数图">
    <defs>
      <linearGradient id="wave-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#42cee6" stopOpacity=".16" />
        <stop offset="1" stopColor="#42cee6" stopOpacity="0" />
      </linearGradient>
    </defs>
    {geometry.ticks.map(tick => <g key={tick}>
      <line className="wave-grid" x1={geometry.left} x2={geometry.width - geometry.right} y1={geometry.y(tick)} y2={geometry.y(tick)} />
      <text className="wave-axis" x={geometry.width - geometry.right + 9} y={geometry.y(tick) + 3}>{tick.toFixed(2)}</text>
    </g>)}
    {result.levels.map(level => <g key={level.label} className={`wave-level ${level.kind}`}>
      <line x1={geometry.left} x2={geometry.width - geometry.right} y1={geometry.y(level.price)} y2={geometry.y(level.price)} />
      <text x={geometry.left + 7} y={geometry.y(level.price) - 5}>{level.label} · {level.price.toFixed(2)}</text>
    </g>)}
    <path className="wave-close-area" d={`${geometry.closePath} L${geometry.x(result.series.length - 1)},${geometry.height - geometry.bottom} L${geometry.left},${geometry.height - geometry.bottom} Z`} />
    <path className="wave-close-line" d={geometry.closePath} />
    <path className="wave-count-line" d={geometry.wavePath} />
    {result.pivots.map(point => {
      const px = geometry.x(point.index);
      const py = geometry.y(point.price);
      return <g key={`${point.date}-${point.label}`} className={`wave-pivot ${point.label.match(/[ABC]/) ? "correction" : "impulse"}`}>
        <line x1={px} x2={px} y1={py} y2={geometry.height - geometry.bottom} />
        <circle cx={px} cy={py} r="6" />
        <text className="wave-pivot-label" x={px} y={py + (point.kind === "high" ? -13 : 20)} textAnchor="middle">{point.label}</text>
        <text className="wave-pivot-date" x={px} y={geometry.height - 12} textAnchor="middle">{point.date.slice(5)}</text>
      </g>;
    })}
  </svg>;
}

export default function WaveTheoryWorkspace() {
  const defaults = useMemo(initialDates, []);
  const [code, setCode] = useState("600519");
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [reversalPct, setReversalPct] = useState("5");
  const [result, setResult] = useState<WaveAnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function runAnalysis() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/technical-analysis/wave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, startDate, endDate, reversalPct: Number(reversalPct) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "波浪分析失败");
      setResult(payload as WaveAnalysisResult);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "波浪分析失败");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setCode("600519");
    setStartDate(defaults.start);
    setEndDate(defaults.end);
    setReversalPct("5");
    setResult(null);
    setError("");
  }

  return <div className="wave-workspace">
    <aside className="wave-config">
      <div className="wave-config-title"><Waves /><div><strong>波浪理论</strong><span>ELLIOTT WAVE · CANDIDATE COUNT</span></div></div>
      <label>证券代码<input className="wave-input" value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="600519 / SH600519" /></label>
      <div className="wave-form-grid">
        <label>开始日期<input className="wave-input" type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
        <label>结束日期<input className="wave-input" type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
      </div>
      <label>转折阈值
        <div className="wave-threshold"><input className="wave-input" type="number" min="2" max="20" step="0.5" value={reversalPct} onChange={event => setReversalPct(event.target.value)} /><span>%</span></div>
        <small>阈值越低转折越敏感；默认 5% 适合日线结构。</small>
      </label>
      <button className="wave-run" onClick={runAnalysis} disabled={loading}><Play />{loading ? "正在读取真实行情…" : "运行波浪分析"}</button>
      <button className="wave-reset" onClick={reset} disabled={loading}><RotateCcw />重置参数</button>
      <p className="wave-integrity"><ShieldCheck />真实前复权日线 · ZigZag 转折 · 显式规则校验</p>
      {error && <div className="wave-error" role="alert"><AlertTriangle />{error}</div>}
    </aside>

    <main className="wave-output">
      {!result ? <div className="wave-welcome">
        <Waves />
        <strong>{loading ? "正在构建候选波浪结构" : "等待真实行情分析"}</strong>
        <p>系统不会生成演示归数。设置标的、区间和转折阈值后，从真实前复权日线识别推动浪与调整浪候选。</p>
        <div><span>5 浪推动</span><span>A-B-C 调整</span><span>斐波那契位置</span><span>规则失效提示</span></div>
      </div> : <>
        <header className="wave-result-head">
          <div><span>候选归数 · {result.request.code}</span><h2>{result.currentStage}</h2><p>{result.stageNote}</p></div>
          <div className="wave-source"><Database /><span><b>{result.dataMeta.provider || result.dataMeta.source || "真实行情"}</b><small>{result.dataMeta.adjustment || "前复权"} · {result.dataMeta.barCount} 根日线 · {result.dataMeta.firstBar} — {result.dataMeta.lastBar}</small></span></div>
        </header>
        <section className="wave-summary">
          <article><span>方向候选</span><strong className={result.bias}>{result.bias === "bullish" ? "上升推动" : "下降推动"}</strong></article>
          <article><span>结构置信度</span><strong>{result.confidenceScore}<small>/100 · {result.confidenceLabel}</small></strong><i><em style={{ width: `${result.confidenceScore}%` }} /></i></article>
          <article><span>识别转折</span><strong>{result.allPivotCount}<small>个 · 展示 {result.pivots.length} 个</small></strong></article>
          <article><span>最新价</span><strong>{result.series.at(-1)?.close.toFixed(2)}<small>{result.series.at(-1)?.date}</small></strong></article>
        </section>
        <section className="wave-chart-panel">
          <div className="wave-section-head"><div><b>日线结构与候选归数</b><span>收盘价用于转折识别，虚线为动态斐波那契参考</span></div><div><i />真实收盘价<i className="count" />候选波浪</div></div>
          <WaveChart result={result} />
          <div className="wave-sequence" aria-label="波浪节点序列">{result.pivots.map(point => <article key={`${point.date}-${point.label}`}><b>{point.label}</b><span>{point.price.toFixed(2)}</span><small>{point.date}</small></article>)}</div>
        </section>
        <div className="wave-lower">
          <section className="wave-panel">
            <div className="wave-section-head"><div><b>硬规则校验</b><span>违反规则时当前推动浪归数失效</span></div></div>
            <div className="wave-rules">{result.rules.map(rule => <article key={rule.id} className={rule.passed === true ? "pass" : rule.passed === false ? "fail" : "unknown"}>{rule.passed === true ? <Check /> : rule.passed === false ? <X /> : <AlertTriangle />}<span>{rule.label}</span><b>{rule.passed === true ? "通过" : rule.passed === false ? "失效" : "待确认"}</b></article>)}</div>
          </section>
          <section className="wave-panel">
            <div className="wave-section-head"><div><b>斐波那契价位</b><span>基于当前候选第 1 浪动态计算</span></div></div>
            <div className="wave-level-list">{result.levels.map(level => <article key={level.label}><span>{level.label}</span><b>{level.price.toFixed(2)}</b><em>{level.kind === "target" ? "目标" : level.kind === "support" ? "支撑" : "压力"}</em></article>)}</div>
          </section>
        </div>
        <footer className="wave-disclaimer"><AlertTriangle />{result.disclaimer}</footer>
      </>}
    </main>
  </div>;
}
