"""Candidate Elliott-wave structure analysis over real adjusted daily bars.

Wave counting is inherently non-unique.  The engine therefore returns a
candidate count, explicit rule checks and a confidence score instead of
presenting a subjective count as fact.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import math
from typing import Any

from real_backtest import Bar, get_real_bars, normalize_symbol


TZ = timezone(timedelta(hours=8))


def _zigzag(bars: list[Bar], reversal_pct: float) -> list[dict[str, Any]]:
    prices = [bar.close for bar in bars]
    threshold = reversal_pct / 100
    high_index = low_index = 0
    high_price = low_price = prices[0]
    direction = 0
    pivots: list[dict[str, Any]] = []

    for index, price in enumerate(prices[1:], 1):
        if direction == 0:
            if price > high_price:
                high_price, high_index = price, index
            if price < low_price:
                low_price, low_index = price, index
            if high_index > low_index and high_price / low_price - 1 >= threshold:
                pivots.append(_pivot(bars, low_index, "low"))
                direction = 1
            elif low_index > high_index and high_price / low_price - 1 >= threshold:
                pivots.append(_pivot(bars, high_index, "high"))
                direction = -1
        elif direction == 1:
            if price >= high_price:
                high_price, high_index = price, index
            elif high_price and high_price / price - 1 >= threshold:
                pivots.append(_pivot(bars, high_index, "high"))
                direction = -1
                low_price, low_index = price, index
        else:
            if price <= low_price:
                low_price, low_index = price, index
            elif low_price and price / low_price - 1 >= threshold:
                pivots.append(_pivot(bars, low_index, "low"))
                direction = 1
                high_price, high_index = price, index

    terminal_index = high_index if direction >= 0 else low_index
    terminal_type = "high" if direction >= 0 else "low"
    if not pivots or pivots[-1]["index"] != terminal_index:
        pivots.append(_pivot(bars, terminal_index, terminal_type))
    return sorted({item["index"]: item for item in pivots}.values(), key=lambda item: item["index"])


def _pivot(bars: list[Bar], index: int, kind: str) -> dict[str, Any]:
    return {"index": index, "date": bars[index].date, "price": round(bars[index].close, 4), "kind": kind}


def _impulse_rules(points: list[dict[str, Any]], bullish: bool) -> list[dict[str, Any]]:
    if len(points) < 6:
        return [
            {"id": "wave2", "label": "第2浪未越过第1浪起点", "passed": None},
            {"id": "wave3", "label": "第3浪不是最短推动浪", "passed": None},
            {"id": "wave4", "label": "第4浪未进入第1浪价格区", "passed": None},
        ]
    p = [float(item["price"]) for item in points[:6]]
    sign = 1 if bullish else -1
    wave1, wave3, wave5 = sign * (p[1] - p[0]), sign * (p[3] - p[2]), sign * (p[5] - p[4])
    wave2_valid = sign * (p[2] - p[0]) > 0
    wave3_valid = wave3 > 0 and wave3 >= min(wave1, wave5)
    wave4_valid = sign * (p[4] - p[1]) > 0
    return [
        {"id": "wave2", "label": "第2浪未越过第1浪起点", "passed": wave2_valid},
        {"id": "wave3", "label": "第3浪不是最短推动浪", "passed": wave3_valid},
        {"id": "wave4", "label": "第4浪未进入第1浪价格区", "passed": wave4_valid},
    ]


def _candidate_window(pivots: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], bool]:
    for start in range(max(0, len(pivots) - 12), max(0, len(pivots) - 5)):
        points = pivots[start:start + 6]
        if len(points) < 6:
            continue
        bullish = points[0]["kind"] == "low"
        rules = _impulse_rules(points, bullish)
        if all(rule["passed"] is True for rule in rules):
            return pivots[start:min(start + 9, len(pivots))], bullish
    points = pivots[-min(9, len(pivots)):]
    bullish = bool(points and points[0]["kind"] == "low")
    return points, bullish


def _levels(points: list[dict[str, Any]], bullish: bool) -> list[dict[str, Any]]:
    if len(points) < 2:
        return []
    p0, p1 = float(points[0]["price"]), float(points[1]["price"])
    amplitude = p1 - p0
    levels = [
        ("第1浪 38.2% 回撤", p1 - amplitude * .382, "support" if bullish else "resistance"),
        ("第1浪 61.8% 回撤", p1 - amplitude * .618, "support" if bullish else "resistance"),
    ]
    if len(points) >= 3:
        p2 = float(points[2]["price"])
        levels.extend([
            ("第3浪 1.618 延伸", p2 + amplitude * 1.618, "target"),
            ("第3浪 2.618 延伸", p2 + amplitude * 2.618, "target"),
        ])
    return [{"label": label, "price": round(price, 2), "kind": kind} for label, price, kind in levels if price > 0]


def _stage(count: int) -> tuple[str, str]:
    labels = [
        ("等待第1浪确认", "起始转折仍需更多摆动确认"),
        ("第1浪候选", "趋势反转的首段推动正在形成"),
        ("第2浪候选", "关注回撤是否守住第1浪起点"),
        ("第3浪候选", "关注推动幅度与量价确认"),
        ("第4浪候选", "关注是否侵入第1浪价格区"),
        ("第5浪候选", "关注动能衰减与潜在背离"),
        ("A浪候选", "推动结构后首段调整"),
        ("B浪候选", "调整中的反向修复，陷阱风险较高"),
        ("C浪候选", "关注调整结构是否完成"),
    ]
    return labels[min(max(count - 1, 0), len(labels) - 1)]


def execute(request: dict[str, Any], database_path: str) -> dict[str, Any]:
    start, end = str(request.get("start_date") or ""), str(request.get("end_date") or "")
    try:
        start_date, end_date = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError as exc:
        raise ValueError("开始和结束日期必须为 YYYY-MM-DD") from exc
    if start_date >= end_date:
        raise ValueError("开始日期必须早于结束日期")
    if end_date > datetime.now(TZ).date():
        raise ValueError("结束日期不能晚于今天")
    reversal_pct = float(request.get("reversal_pct", 5))
    if not 2 <= reversal_pct <= 20:
        raise ValueError("转折阈值应在 2%–20% 之间")
    bars, data_meta = get_real_bars(str(request.get("code") or ""), start, end, database_path)
    selected = [bar for bar in bars if start <= bar.date <= end]
    if len(selected) < 60:
        raise ValueError(f"有效交易日不足：当前 {len(selected)}，至少需要 60")
    pivots = _zigzag(selected, reversal_pct)
    if len(pivots) < 3:
        raise ValueError("当前阈值下转折点不足，请扩大区间或降低转折阈值")
    candidate, bullish = _candidate_window(pivots)
    labels = ["0", "1", "2", "3", "4", "5", "A", "B", "C"]
    for index, item in enumerate(candidate):
        item["label"] = labels[min(index, len(labels) - 1)]
    rules = _impulse_rules(candidate, bullish)
    known_rules = [rule for rule in rules if rule["passed"] is not None]
    passed = sum(rule["passed"] is True for rule in known_rules)
    amplitude = abs(float(candidate[-1]["price"]) / float(candidate[0]["price"]) - 1) * 100
    confidence = min(92, round(30 + min(len(candidate), 9) * 4 + (passed / max(len(known_rules), 1)) * 22 + min(amplitude, 20) * .8))
    confidence_label = "高" if confidence >= 75 else "中" if confidence >= 55 else "低"
    stage, stage_note = _stage(len(candidate))
    symbol, code = normalize_symbol(str(request.get("code") or ""))
    return {
        "createdAt": datetime.now(TZ).isoformat(timespec="seconds"),
        "request": {"code": code, "startDate": start, "endDate": end, "reversalPct": reversal_pct},
        "series": [{"date": bar.date, "close": round(bar.close, 4)} for bar in selected],
        "pivots": candidate,
        "allPivotCount": len(pivots),
        "bias": "bullish" if bullish else "bearish",
        "currentStage": stage,
        "stageNote": stage_note,
        "confidenceScore": confidence,
        "confidenceLabel": confidence_label,
        "rules": rules,
        "levels": _levels(candidate, bullish),
        "dataMeta": {**data_meta, "symbol": symbol, "firstBar": selected[0].date, "lastBar": selected[-1].date, "barCount": len(selected)},
        "disclaimer": "波浪计数具有主观性；本结果是基于收盘价 ZigZag 的候选结构，不构成唯一归数或投资建议。",
    }
