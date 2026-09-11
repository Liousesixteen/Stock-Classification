"""Reproducible long-only A-share strategy backtest driven by real daily bars.

Signals are calculated after a bar closes and are executed at the next trading
day's open.  This deliberate one-bar delay prevents look-ahead bias.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
from statistics import mean, pstdev
from typing import Any, Iterable
import urllib.parse
import urllib.request


TZ = timezone(timedelta(hours=8))
UA = "Mozilla/5.0 Yidianx/1.2"


@dataclass(frozen=True)
class Bar:
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


def normalize_symbol(value: str) -> tuple[str, str]:
    raw = value.strip().lower().replace(".", "")
    for prefix in ("sh", "sz", "bj"):
        if raw.startswith(prefix) and raw[2:].isdigit() and len(raw[2:]) == 6:
            return raw, raw[2:]
    if not (raw.isdigit() and len(raw) == 6):
        raise ValueError("股票代码应为 6 位 A 股代码，例如 600519")
    prefix = "sh" if raw[0] in "569" else "bj" if raw[0] in "48" else "sz"
    return prefix + raw, raw


def _finite(value: Any) -> float:
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise ValueError("行情包含无效价格")
    return number


def fetch_tencent_bars(symbol: str, start: str, end: str, limit: int = 2000) -> list[Bar]:
    param = f"{symbol},day,{start},{end},{max(30, min(limit, 3000))},qfq"
    url = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?" + urllib.parse.urlencode({"param": param})
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.loads(response.read(8_000_000).decode("utf-8", "replace"))
    root = (payload.get("data") or {}).get(symbol) or {}
    rows = root.get("qfqday") or root.get("day") or []
    bars: list[Bar] = []
    for row in rows:
        try:
            if len(row) >= 6:
                bars.append(Bar(str(row[0]), _finite(row[1]), _finite(row[3]), _finite(row[4]), _finite(row[2]), max(0.0, float(row[5]))))
        except (TypeError, ValueError):
            continue
    bars.sort(key=lambda item: item.date)
    return _unique_bars(bars)


def load_local_bars(database_path: str, code: str, start: str, end: str) -> list[Bar]:
    if not database_path or not Path(database_path).exists():
        return []
    connection = sqlite3.connect(database_path)
    try:
        rows = connection.execute(
            "SELECT date, open, high, low, close, COALESCE(volume, 0) FROM stock_daily "
            "WHERE code = ? AND date >= ? AND date <= ? ORDER BY date",
            (code, start, end),
        ).fetchall()
    except sqlite3.Error:
        return []
    finally:
        connection.close()
    bars: list[Bar] = []
    for row in rows:
        try:
            bars.append(Bar(str(row[0]), _finite(row[1]), _finite(row[2]), _finite(row[3]), _finite(row[4]), max(0.0, float(row[5]))))
        except (TypeError, ValueError):
            continue
    return _unique_bars(bars)


def _unique_bars(bars: Iterable[Bar]) -> list[Bar]:
    return sorted({bar.date: bar for bar in bars}.values(), key=lambda bar: bar.date)


def _market_cache_path(database_path: str, symbol: str) -> Path:
    root = Path(database_path).resolve().parent / "market-cache"
    return root / f"{symbol}-qfq-day.json"


def save_market_cache(database_path: str, symbol: str, bars: list[Bar]) -> None:
    target = _market_cache_path(database_path, symbol)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "腾讯前复权日K",
        "savedAt": datetime.now(TZ).isoformat(timespec="seconds"),
        "items": [bar.__dict__ for bar in bars],
    }
    temporary = target.with_name(f".{target.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    os.replace(temporary, target)


def load_market_cache(database_path: str, symbol: str, start: str, end: str) -> tuple[list[Bar], str | None]:
    target = _market_cache_path(database_path, symbol)
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
        bars = _unique_bars(Bar(**row) for row in payload.get("items", []) if start <= str(row.get("date", "")) <= end)
        return bars, str(payload.get("savedAt") or "") or None
    except (OSError, ValueError, TypeError):
        return [], None


def get_real_bars(code: str, start: str, end: str, database_path: str) -> tuple[list[Bar], dict[str, Any]]:
    symbol, plain_code = normalize_symbol(code)
    requested_start = date.fromisoformat(start)
    warmup_start = (requested_start - timedelta(days=550)).isoformat()
    error: Exception | None = None
    try:
        bars = fetch_tencent_bars(symbol, warmup_start, end)
        if bars:
            save_market_cache(database_path, symbol, bars)
            return bars, {
                "source": "腾讯前复权日K",
                "adjustment": "前复权",
                "symbol": symbol,
                "asOf": bars[-1].date,
                "fetchedAt": datetime.now(TZ).isoformat(timespec="seconds"),
            }
    except Exception as exc:  # local cache remains a legitimate fallback
        error = exc
    bars, cached_at = load_market_cache(database_path, symbol, warmup_start, end)
    if bars:
        return bars, {
            "source": "腾讯前复权日K · 本地缓存",
            "adjustment": "前复权",
            "symbol": symbol,
            "asOf": bars[-1].date,
            "fetchedAt": cached_at or datetime.now(TZ).isoformat(timespec="seconds"),
            "fallback": True,
        }
    bars = load_local_bars(database_path, plain_code, warmup_start, end)
    if bars:
        return bars, {
            "source": "DA-Stock 本地日线库",
            "adjustment": "按库存口径",
            "symbol": symbol,
            "asOf": bars[-1].date,
            "fetchedAt": datetime.now(TZ).isoformat(timespec="seconds"),
            "fallback": True,
        }
    detail = f"（{type(error).__name__}）" if error else ""
    raise ValueError(f"未取得 {plain_code} 的真实历史日线{detail}，未使用模拟数据")


def _sma(values: list[float], length: int, end_index: int) -> float | None:
    start = end_index - length + 1
    return mean(values[start:end_index + 1]) if start >= 0 else None


def _target_position(strategy: str, closes: list[float], index: int, fast: int, slow: int) -> bool:
    if strategy == "buy_hold":
        return True
    fast_value = _sma(closes, fast, index)
    slow_value = _sma(closes, slow, index)
    if fast_value is None or slow_value is None:
        return False
    if strategy == "ma_cross":
        return fast_value > slow_value
    if strategy == "momentum":
        prior = closes[index - slow] if index >= slow else None
        return prior is not None and closes[index] > prior and fast_value > slow_value
    raise ValueError("暂不支持该策略")


def _max_drawdown(values: list[float]) -> float:
    peak = 0.0
    worst = 0.0
    for value in values:
        peak = max(peak, value)
        if peak:
            worst = min(worst, value / peak - 1.0)
    return worst


def _round(value: float | None, digits: int = 4) -> float | None:
    return None if value is None or not math.isfinite(value) else round(value, digits)


def run_strategy(request: dict[str, Any], bars: list[Bar], data_meta: dict[str, Any]) -> dict[str, Any]:
    code = normalize_symbol(str(request["code"]))[1]
    start, end = str(request["start_date"]), str(request["end_date"])
    strategy = str(request.get("strategy") or "ma_cross")
    fast, slow = int(request.get("fast_period", 10)), int(request.get("slow_period", 30))
    initial = float(request.get("initial_capital", 100_000))
    commission = float(request.get("commission_bps", 3)) / 10_000
    slippage = float(request.get("slippage_bps", 2)) / 10_000
    sell_tax = float(request.get("sell_tax_bps", 5)) / 10_000
    if not 2 <= fast < slow <= 250:
        raise ValueError("均线参数须满足 2 ≤ 短周期 < 长周期 ≤ 250")
    if initial < 10_000:
        raise ValueError("初始资金不能低于 10,000 元")
    if min(commission, slippage, sell_tax) < 0 or max(commission, slippage, sell_tax) > 0.01:
        raise ValueError("交易成本参数应在 0–100 个基点之间")
    selected = [bar for bar in bars if start <= bar.date <= end]
    if len(selected) < max(slow + 2, 30):
        raise ValueError(f"有效交易日不足：当前 {len(selected)}，至少需要 {max(slow + 2, 30)}")
    all_closes = [bar.close for bar in bars]
    index_by_date = {bar.date: index for index, bar in enumerate(bars)}

    cash, shares = initial, 0
    entry_cost = 0.0
    pending: bool | None = None
    orders: list[dict[str, Any]] = []
    round_trips: list[float] = []
    curve: list[dict[str, Any]] = []

    first = selected[0]
    benchmark_price = first.open * (1 + slippage)
    benchmark_shares = math.floor(initial / (benchmark_price * 100)) * 100
    benchmark_fee = max(5.0, benchmark_shares * benchmark_price * commission) if benchmark_shares else 0.0
    while benchmark_shares and benchmark_shares * benchmark_price + benchmark_fee > initial:
        benchmark_shares -= 100
        benchmark_fee = max(5.0, benchmark_shares * benchmark_price * commission) if benchmark_shares else 0.0
    if benchmark_shares == 0:
        required = math.ceil(benchmark_price * 100 + 5)
        raise ValueError(f"初始资金不足以买入 100 股；按首日开盘价至少需要约 {required:,} 元")
    benchmark_cash = initial - benchmark_shares * benchmark_price - benchmark_fee

    for local_index, bar in enumerate(selected):
        if pending is True and shares == 0:
            price = bar.open * (1 + slippage)
            quantity = math.floor(cash / (price * 100)) * 100
            fee = max(5.0, quantity * price * commission) if quantity else 0.0
            while quantity and quantity * price + fee > cash:
                quantity -= 100
                fee = max(5.0, quantity * price * commission) if quantity else 0.0
            if quantity:
                amount = quantity * price
                cash -= amount + fee
                shares = quantity
                entry_cost = amount + fee
                orders.append({"date": bar.date, "side": "buy", "price": _round(price), "shares": quantity, "fee": _round(fee, 2), "tax": 0.0})
        elif pending is False and shares > 0:
            price = bar.open * (1 - slippage)
            amount = shares * price
            fee = max(5.0, amount * commission)
            tax = amount * sell_tax
            proceeds = amount - fee - tax
            cash += proceeds
            round_trips.append(proceeds / entry_cost - 1 if entry_cost else 0.0)
            orders.append({"date": bar.date, "side": "sell", "price": _round(price), "shares": shares, "fee": _round(fee, 2), "tax": _round(tax, 2)})
            shares = 0
            entry_cost = 0.0

        equity = cash + shares * bar.close
        benchmark = benchmark_cash + benchmark_shares * bar.close
        curve.append({
            "date": bar.date,
            "equity": _round(equity, 2),
            "strategyReturnPct": _round((equity / initial - 1) * 100),
            "benchmarkReturnPct": _round((benchmark / initial - 1) * 100),
        })
        global_index = index_by_date[bar.date]
        pending = _target_position(strategy, all_closes, global_index, fast, slow)

    equities = [float(point["equity"]) for point in curve]
    daily_returns = [equities[i] / equities[i - 1] - 1 for i in range(1, len(equities)) if equities[i - 1] > 0]
    years = max((date.fromisoformat(selected[-1].date) - date.fromisoformat(selected[0].date)).days / 365.25, 1 / 365.25)
    total_return = equities[-1] / initial - 1
    annualized = (equities[-1] / initial) ** (1 / years) - 1 if equities[-1] > 0 else -1.0
    volatility = pstdev(daily_returns) * math.sqrt(252) if len(daily_returns) > 1 else 0.0
    sharpe = mean(daily_returns) / pstdev(daily_returns) * math.sqrt(252) if len(daily_returns) > 1 and pstdev(daily_returns) > 0 else None
    benchmark_return = float(curve[-1]["benchmarkReturnPct"]) / 100
    winning = [value for value in round_trips if value > 0]
    losing = [value for value in round_trips if value < 0]
    gross_profit = sum(winning)
    gross_loss = abs(sum(losing))
    summary = {
        "initialCapital": _round(initial, 2), "finalEquity": _round(equities[-1], 2),
        "totalReturnPct": _round(total_return * 100), "benchmarkReturnPct": _round(benchmark_return * 100),
        "excessReturnPct": _round((total_return - benchmark_return) * 100), "annualizedReturnPct": _round(annualized * 100),
        "annualizedVolatilityPct": _round(volatility * 100), "maxDrawdownPct": _round(_max_drawdown(equities) * 100),
        "sharpeRatio": _round(sharpe), "completedTrades": len(round_trips),
        "winRatePct": _round(len(winning) / len(round_trips) * 100) if round_trips else None,
        "profitFactor": _round(gross_profit / gross_loss) if gross_loss else None,
        "positionAtEnd": "long" if shares else "cash", "bars": len(selected),
    }
    normalized_request = {
        "code": code, "startDate": start, "endDate": end, "strategy": strategy,
        "fastPeriod": fast, "slowPeriod": slow, "initialCapital": initial,
        "commissionBps": commission * 10_000, "slippageBps": slippage * 10_000, "sellTaxBps": sell_tax * 10_000,
    }
    fingerprint = json.dumps({"request": normalized_request, "asOf": data_meta.get("asOf"), "lastClose": selected[-1].close}, sort_keys=True)
    return {
        "runId": hashlib.sha256(fingerprint.encode()).hexdigest()[:16],
        "createdAt": datetime.now(TZ).isoformat(timespec="seconds"),
        "request": normalized_request, "summary": summary, "equityCurve": curve, "orders": orders,
        "dataMeta": {**data_meta, "firstBar": selected[0].date, "lastBar": selected[-1].date, "barCount": len(selected)},
        "methodology": {
            "signalTiming": "收盘后生成信号，下一交易日开盘成交",
            "positionSizing": "A股100股整数手，单标的满仓/空仓",
            "benchmark": "同一标的首日开盘买入并持有（计入买入佣金与滑点）",
            "riskFreeRate": "Sharpe 使用 0% 无风险利率",
            "survivorshipBias": "单标的回测，不涉及成分股幸存者偏差",
        },
    }


def persist_run(payload: dict[str, Any], database_path: str) -> None:
    root = Path(database_path).resolve().parent / "backtest-runs"
    root.mkdir(parents=True, exist_ok=True)
    target = root / f"{payload['runId']}.json"
    temporary = root / f".{payload['runId']}.{os.getpid()}.tmp"
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, target)


def execute(request: dict[str, Any], database_path: str) -> dict[str, Any]:
    start = str(request.get("start_date") or "")
    end = str(request.get("end_date") or "")
    try:
        start_date, end_date = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError as exc:
        raise ValueError("开始和结束日期必须为 YYYY-MM-DD") from exc
    if start_date >= end_date:
        raise ValueError("开始日期必须早于结束日期")
    if end_date > datetime.now(TZ).date():
        raise ValueError("结束日期不能晚于今天")
    bars, meta = get_real_bars(str(request.get("code") or ""), start, end, database_path)
    result = run_strategy(request, bars, meta)
    persist_run(result, database_path)
    return result
