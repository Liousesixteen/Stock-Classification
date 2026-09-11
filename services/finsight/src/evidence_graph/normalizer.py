"""Financial entity, metric, period, unit, and source normalisation."""

from __future__ import annotations

import datetime as dt
import math
import re
from dataclasses import dataclass
from typing import Any, Iterable, Optional
from urllib.parse import urlparse

METRIC_ALIASES = {
    "营业收入": "revenue",
    "营收": "revenue",
    "revenue": "revenue",
    "total revenue": "revenue",
    "营业利润": "operating_profit",
    "operating profit": "operating_profit",
    "净利润": "net_profit",
    "归母净利润": "net_profit_attributable",
    "net income": "net_profit",
    "毛利率": "gross_margin",
    "gross margin": "gross_margin",
    "经营活动现金流": "operating_cash_flow",
    "经营现金流": "operating_cash_flow",
    "operating cash flow": "operating_cash_flow",
    "研发费用": "research_and_development_expense",
    "r&d expense": "research_and_development_expense",
    "资产负债率": "debt_to_asset_ratio",
    "roe": "return_on_equity",
    "pe": "price_earnings_ratio",
    "pb": "price_book_ratio",
}

UNIT_MULTIPLIERS = {
    "": 1.0,
    "元": 1.0,
    "千元": 1_000.0,
    "万元": 10_000.0,
    "百万元": 1_000_000.0,
    "亿元": 100_000_000.0,
    "k": 1_000.0,
    "thousand": 1_000.0,
    "million": 1_000_000.0,
    "billion": 1_000_000_000.0,
    "%": 0.01,
    "percent": 0.01,
}

OFFICIAL_DOMAINS = (
    "gov.cn",
    "cninfo.com.cn",
    "sse.com.cn",
    "szse.cn",
    "hkexnews.hk",
    "sec.gov",
    "stats.gov.cn",
    "pbc.gov.cn",
)
HIGH_QUALITY_DOMAINS = (
    "reuters.com",
    "bloomberg.com",
    "ft.com",
    "wsj.com",
    "caixin.com",
)


@dataclass(slots=True)
class NormalizedValue:
    value: float
    raw_value: Any
    unit: str
    canonical_unit: str
    multiplier: float
    currency: Optional[str]


def canonical_metric(name: Any) -> str:
    text = str(name or "").strip()
    key = re.sub(r"\s+", " ", text.lower())
    if key in METRIC_ALIASES:
        return METRIC_ALIASES[key]
    slug = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff]+", "_", key).strip("_")
    return slug or "unknown_metric"


def normalize_currency(currency: Any) -> Optional[str]:
    if currency is None:
        return None
    text = str(currency).strip().upper()
    mapping = {"人民币": "CNY", "RMB": "CNY", "￥": "CNY", "美元": "USD", "$": "USD", "港元": "HKD", "HK$": "HKD"}
    return mapping.get(text, text[:8] or None)


def normalize_numeric(value: Any, unit: str = "", currency: Any = None) -> Optional[NormalizedValue]:
    if isinstance(value, bool) or value is None:
        return None
    if hasattr(value, "item"):
        try:
            value = value.item()
        except Exception:
            pass
    raw_value = value
    detected_unit = str(unit or "").strip().lower()
    if isinstance(value, str):
        text = value.strip().replace(",", "")
        if text in {"", "-", "--", "N/A", "n/a", "None", "null"}:
            return None
        negative = text.startswith("(") and text.endswith(")")
        if negative:
            text = "-" + text[1:-1]
        for candidate in sorted(UNIT_MULTIPLIERS, key=len, reverse=True):
            if candidate and text.lower().endswith(candidate):
                detected_unit = candidate
                text = text[: -len(candidate)].strip()
                break
        try:
            value = float(text)
        except ValueError:
            return None
    if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        return None
    multiplier = UNIT_MULTIPLIERS.get(detected_unit, 1.0)
    canonical_unit = "ratio" if detected_unit in {"%", "percent"} else "base"
    return NormalizedValue(
        value=float(value) * multiplier,
        raw_value=raw_value,
        unit=str(unit or detected_unit),
        canonical_unit=canonical_unit,
        multiplier=multiplier,
        currency=normalize_currency(currency),
    )


def normalize_period(value: Any) -> dict[str, Optional[str]]:
    text = str(value or "").strip()
    today = dt.date.today()
    patterns = [
        (r"^(20\d{2})$", lambda m: (f"FY{m.group(1)}", f"{m.group(1)}-01-01", f"{m.group(1)}-12-31", "annual")),
        (r"^(?:FY)?(20\d{2})$", lambda m: (f"FY{m.group(1)}", f"{m.group(1)}-01-01", f"{m.group(1)}-12-31", "annual")),
        (r"^(20\d{2})[-年 ]?Q([1-4])$", _quarter_period),
        (r"^(20\d{2})[-年/]?(\d{1,2})月?$", _month_period),
        (r"^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})$", _day_period),
    ]
    for pattern, factory in patterns:
        match = re.match(pattern, text, flags=re.IGNORECASE)
        if match:
            label, start, end, frequency = factory(match)
            return {"label": label, "start": start, "end": end, "frequency": frequency, "raw": text}
    return {
        "label": text or f"as_of_{today.isoformat()}",
        "start": None,
        "end": None,
        "frequency": "unknown",
        "raw": text,
    }


def _quarter_period(match: re.Match[str]) -> tuple[str, str, str, str]:
    year, quarter = int(match.group(1)), int(match.group(2))
    start_month = (quarter - 1) * 3 + 1
    end_month = start_month + 2
    if end_month == 12:
        end_day = 31
    else:
        end_day = (dt.date(year, end_month + 1, 1) - dt.timedelta(days=1)).day
    return (
        f"{year}Q{quarter}",
        f"{year:04d}-{start_month:02d}-01",
        f"{year:04d}-{end_month:02d}-{end_day:02d}",
        "quarterly",
    )


def _month_period(match: re.Match[str]) -> tuple[str, str, str, str]:
    year, month = int(match.group(1)), int(match.group(2))
    if month == 12:
        end = dt.date(year, 12, 31)
    else:
        end = dt.date(year, month + 1, 1) - dt.timedelta(days=1)
    return f"{year}-{month:02d}", f"{year:04d}-{month:02d}-01", end.isoformat(), "monthly"


def _day_period(match: re.Match[str]) -> tuple[str, str, str, str]:
    date = dt.date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    return date.isoformat(), date.isoformat(), date.isoformat(), "daily"


def infer_period(values: Iterable[Any]) -> Optional[str]:
    for value in values:
        text = str(value or "")
        match = re.search(
            r"20\d{2}(?:[-年/]?Q[1-4]|[-年/]?\d{1,2}月?|[-/]\d{1,2}[-/]\d{1,2})?", text, flags=re.IGNORECASE
        )
        if match:
            return match.group(0).replace("年", "-").replace("月", "")
    return None


def source_authority(source: Any, source_type: str = "") -> tuple[float, str]:
    text = str(source or "").strip()
    domain = urlparse(text.replace("URL:", "").strip()).netloc.lower()
    lowered = f"{text} {source_type}".lower()
    if any(domain.endswith(item) for item in OFFICIAL_DOMAINS) or any(
        token in lowered for token in ("监管", "交易所", "年报", "公告", "official", "filing")
    ):
        return 0.98, "primary_official"
    if any(domain.endswith(item) for item in HIGH_QUALITY_DOMAINS):
        return 0.82, "professional_media"
    if any(token in lowered for token in ("公司官网", "investor relations", "ir.")):
        return 0.9, "company_ir"
    if any(token in lowered for token in ("research", "研报", "broker")):
        return 0.75, "professional_research"
    if domain:
        return 0.6, "web_source"
    return 0.5, "unknown"
