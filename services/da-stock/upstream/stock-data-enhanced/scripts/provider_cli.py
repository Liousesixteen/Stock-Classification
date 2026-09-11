#!/usr/bin/env python3
"""Unified provider CLI for the enhanced A/HK/US stock data skill.

The CLI keeps provider integration explicit and portable:
- no secrets are printed;
- optional SDKs are imported only when their provider is used;
- HTTP providers use requests directly;
- every provider from data-sources/SKILL.md is represented in metadata.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence
from urllib.parse import quote_plus, urlencode

import requests


ENV_LINE_RE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


PROVIDERS: Dict[str, Dict[str, Any]] = {
    "mootdx": {"kind": "market-data", "markets": ["CN"], "keys": [], "runtime": "mootdx"},
    "tencent": {"kind": "market-data", "markets": ["CN"], "keys": [], "runtime": "http"},
    "sina": {"kind": "market-data", "markets": ["CN"], "keys": [], "runtime": "http"},
    "baidu-stock": {"kind": "market-data", "markets": ["CN"], "keys": [], "runtime": "http"},
    "eastmoney": {"kind": "market-data", "markets": ["CN"], "keys": [], "runtime": "http"},
    "efinance": {"kind": "market-data", "markets": ["CN"], "keys": [], "runtime": "efinance"},
    "akshare": {"kind": "market-data", "markets": ["CN", "HK", "US"], "keys": [], "runtime": "akshare"},
    "tushare": {"kind": "market-data", "markets": ["CN"], "keys": ["TUSHARE_TOKEN"], "runtime": "tushare"},
    "pytdx": {"kind": "market-data", "markets": ["CN"], "keys": ["PYTDX_HOST", "PYTDX_SERVERS"], "runtime": "pytdx"},
    "baostock": {"kind": "market-data", "markets": ["CN"], "keys": [], "runtime": "baostock"},
    "yfinance": {"kind": "market-data", "markets": ["US", "HK", "global"], "keys": [], "runtime": "yfinance"},
    "stooq": {"kind": "market-data", "markets": ["US", "global"], "keys": [], "runtime": "http"},
    "longbridge": {
        "kind": "market-data",
        "markets": ["HK", "US"],
        "keys": ["LONGBRIDGE_OAUTH_TOKEN_CACHE_B64", "LONGBRIDGE_OAUTH_CLIENT_ID", "LONGBRIDGE_APP_KEY", "LONGBRIDGE_APP_SECRET", "LONGBRIDGE_ACCESS_TOKEN"],
        "runtime": "longport",
    },
    "finnhub": {"kind": "market-data", "markets": ["US"], "keys": ["FINNHUB_API_KEY"], "runtime": "http"},
    "alphavantage": {"kind": "market-data", "markets": ["US", "global"], "keys": ["ALPHAVANTAGE_API_KEY"], "runtime": "http"},
    "tickflow": {"kind": "market-review", "markets": ["CN"], "keys": ["TICKFLOW_API_KEY"], "runtime": "tickflow"},
    "stock-index-remote": {"kind": "symbol-index", "markets": ["CN", "HK", "US", "BSE"], "keys": ["STOCK_INDEX_REMOTE_UPDATE_ENABLED"], "runtime": "http"},
    "alphasift": {"kind": "screening", "markets": ["CN"], "keys": ["ALPHASIFT_ENABLED", "ALPHASIFT_INSTALL_SPEC"], "runtime": "alphasift"},
    "anspire-search": {"kind": "news-search", "markets": ["CN", "HK", "US"], "keys": ["ANSPIRE_API_KEYS"], "runtime": "http"},
    "bocha": {"kind": "news-search", "markets": ["CN", "HK", "US"], "keys": ["BOCHA_API_KEYS"], "runtime": "http"},
    "tavily": {"kind": "news-search", "markets": ["global"], "keys": ["TAVILY_API_KEYS"], "runtime": "http"},
    "serpapi": {"kind": "news-search", "markets": ["global"], "keys": ["SERPAPI_API_KEYS"], "runtime": "http"},
    "brave": {"kind": "news-search", "markets": ["global"], "keys": ["BRAVE_API_KEYS"], "runtime": "http"},
    "minimax-search": {"kind": "news-search", "markets": ["global"], "keys": ["MINIMAX_API_KEYS"], "runtime": "http"},
    "searxng": {"kind": "news-search", "markets": ["global"], "keys": ["SEARXNG_BASE_URLS"], "runtime": "http"},
    "social-sentiment": {"kind": "sentiment", "markets": ["US"], "keys": ["SOCIAL_SENTIMENT_API_KEY"], "runtime": "http"},
    "litellm-router": {"kind": "llm", "markets": ["all"], "keys": ["LITELLM_CONFIG", "LITELLM_CONFIG_YAML", "LITELLM_MODEL", "LITELLM_FALLBACK_MODELS", "LLM_CHANNELS"], "runtime": "litellm"},
    "llm-anspire": {"kind": "llm", "markets": ["all"], "keys": ["ANSPIRE_API_KEYS", "ANSPIRE_LLM_BASE_URL", "ANSPIRE_LLM_MODEL"], "runtime": "openai-compatible"},
    "llm-aihubmix": {"kind": "llm", "markets": ["all"], "keys": ["AIHUBMIX_KEY"], "runtime": "openai-compatible"},
    "llm-gemini": {"kind": "llm", "markets": ["all"], "keys": ["GEMINI_API_KEY", "GEMINI_API_KEYS"], "runtime": "gemini"},
    "llm-deepseek": {"kind": "llm", "markets": ["all"], "keys": ["DEEPSEEK_API_KEY", "DEEPSEEK_API_KEYS"], "runtime": "openai-compatible"},
    "llm-anthropic": {"kind": "llm", "markets": ["all"], "keys": ["ANTHROPIC_API_KEY", "ANTHROPIC_API_KEYS"], "runtime": "anthropic"},
    "llm-openai": {"kind": "llm", "markets": ["all"], "keys": ["OPENAI_API_KEY", "OPENAI_API_KEYS", "OPENAI_BASE_URL"], "runtime": "openai-compatible"},
    "llm-moonshot": {"kind": "llm", "markets": ["all"], "keys": ["LLM_MOONSHOT_API_KEY", "LLM_MOONSHOT_API_KEYS"], "runtime": "openai-compatible"},
    "llm-dashscope": {"kind": "llm", "markets": ["all"], "keys": ["LLM_DASHSCOPE_API_KEY", "LLM_DASHSCOPE_API_KEYS"], "runtime": "openai-compatible"},
    "llm-zhipu": {"kind": "llm", "markets": ["all"], "keys": ["LLM_ZHIPU_API_KEY", "LLM_ZHIPU_API_KEYS"], "runtime": "openai-compatible"},
    "llm-minimax": {"kind": "llm", "markets": ["all"], "keys": ["LLM_MINIMAX_API_KEY", "LLM_MINIMAX_API_KEYS"], "runtime": "openai-compatible"},
    "llm-mimo": {"kind": "llm", "markets": ["all"], "keys": ["LLM_MIMO_API_KEY", "LLM_MIMO_API_KEYS"], "runtime": "openai-compatible"},
    "llm-volcengine": {"kind": "llm", "markets": ["all"], "keys": ["LLM_VOLCENGINE_API_KEY", "LLM_VOLCENGINE_API_KEYS"], "runtime": "openai-compatible"},
    "llm-siliconflow": {"kind": "llm", "markets": ["all"], "keys": ["LLM_SILICONFLOW_API_KEY", "LLM_SILICONFLOW_API_KEYS"], "runtime": "openai-compatible"},
    "llm-openrouter": {"kind": "llm", "markets": ["all"], "keys": ["LLM_OPENROUTER_API_KEY", "LLM_OPENROUTER_API_KEYS"], "runtime": "openai-compatible"},
    "llm-ollama": {"kind": "llm", "markets": ["all"], "keys": ["OLLAMA_API_BASE", "LLM_OLLAMA_BASE_URL"], "runtime": "ollama"},
    "vision": {"kind": "vision", "markets": ["all"], "keys": ["VISION_MODEL", "OPENAI_VISION_MODEL"], "runtime": "llm"},
}


QUOTE_PROVIDERS = ["tencent", "sina", "efinance", "akshare", "yfinance", "finnhub", "alphavantage", "longbridge"]
HISTORY_PROVIDERS = ["yfinance", "stooq", "alphavantage", "akshare", "efinance", "tushare", "baostock"]
NEWS_PROVIDERS = ["anspire-search", "bocha", "tavily", "brave", "serpapi", "minimax-search", "searxng"]


class ProviderError(RuntimeError):
    pass


def parse_env_file(path: Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = ENV_LINE_RE.match(raw_line)
        if not match:
            continue
        key, raw_value = match.groups()
        value = raw_value.strip()
        if " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def load_config(path: Optional[str]) -> Dict[str, str]:
    config = dict(os.environ)
    if path:
        config.update(parse_env_file(Path(path)))
    return config


def env_list(config: Mapping[str, str], key: str) -> List[str]:
    raw = (config.get(key) or "").strip()
    return [item.strip() for item in raw.split(",") if item.strip()]


def first_env(config: Mapping[str, str], keys: Sequence[str]) -> Optional[str]:
    for key in keys:
        value = (config.get(key) or "").strip()
        if value:
            return value
    return None


def require_env(config: Mapping[str, str], keys: Sequence[str]) -> str:
    value = first_env(config, keys)
    if not value:
        raise ProviderError(f"missing one of: {', '.join(keys)}")
    return value


def output(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2, default=str))


def market_of(symbol: str, explicit: str = "auto") -> str:
    if explicit and explicit != "auto":
        return explicit.lower()
    upper = symbol.strip().upper()
    if upper.startswith("HK") or upper.endswith(".HK"):
        return "hk"
    if re.fullmatch(r"\d{5}", upper):
        return "hk"
    if re.fullmatch(r"\d{6}", upper) or upper.startswith(("SH", "SZ", "BJ")):
        return "cn"
    return "us"


def normalize_cn_code(symbol: str) -> str:
    code = symbol.strip().upper()
    if "." in code:
        base, suffix = code.rsplit(".", 1)
        if suffix in {"SH", "SZ", "BJ", "SS"} and base.isdigit():
            return base
        if base in {"SH", "SZ", "BJ"} and suffix.isdigit():
            return suffix
    if code.startswith(("SH", "SZ", "BJ")):
        candidate = code[2:].lstrip(".")
        if candidate.isdigit():
            return candidate
    return code


def normalize_hk_code(symbol: str, suffix: bool = False) -> str:
    code = symbol.strip().upper()
    if code.startswith("HK"):
        digits = code[2:]
    elif code.endswith(".HK"):
        digits = code[:-3]
    else:
        digits = code
    digits = digits.zfill(5) if digits.isdigit() else digits
    return f"{digits}.HK" if suffix else f"HK{digits}"


def cn_exchange_prefix(code: str) -> str:
    pure = normalize_cn_code(code)
    if pure.startswith(("6", "9")):
        return "sh"
    if pure.startswith("8"):
        return "bj"
    return "sz"


def yfinance_symbol(symbol: str, market: str) -> str:
    if market == "hk":
        return normalize_hk_code(symbol, suffix=True)
    if market == "cn":
        code = normalize_cn_code(symbol)
        suffix = ".SS" if code.startswith(("5", "6", "9")) else ".SZ"
        return f"{code}{suffix}"
    return symbol.strip().upper()


def http_get_json(url: str, *, params: Optional[Mapping[str, Any]] = None, headers: Optional[Mapping[str, str]] = None, timeout: int = 15) -> Any:
    resp = requests.get(url, params=params, headers=dict(headers or {"User-Agent": UA}), timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def quote_tencent(symbol: str, market: str, config: Mapping[str, str]) -> Dict[str, Any]:
    if market != "cn":
        raise ProviderError("tencent quote supports CN symbols only")
    code = normalize_cn_code(symbol)
    prefixed = cn_exchange_prefix(code) + code
    resp = requests.get(f"https://qt.gtimg.cn/q={prefixed}", headers={"User-Agent": UA}, timeout=10)
    resp.raise_for_status()
    text = resp.content.decode("gbk", errors="ignore")
    if '"' not in text:
        raise ProviderError("empty tencent response")
    values = text.split('"')[1].split("~")
    if len(values) < 49:
        raise ProviderError("unexpected tencent response shape")
    return {
        "provider": "tencent",
        "symbol": code,
        "name": values[1],
        "price": _float(values[3]),
        "previous_close": _float(values[4]),
        "open": _float(values[5]),
        "change": _float(values[31]),
        "change_pct": _float(values[32]),
        "high": _float(values[33]),
        "low": _float(values[34]),
        "amount": _float(values[37]),
        "turnover_pct": _float(values[38]),
        "pe_ttm": _float(values[39]),
        "market_cap": _float(values[44]),
        "float_market_cap": _float(values[45]),
        "pb": _float(values[46]),
        "limit_up": _float(values[47]),
        "limit_down": _float(values[48]),
    }


def quote_sina(symbol: str, market: str, config: Mapping[str, str]) -> Dict[str, Any]:
    if market != "cn":
        raise ProviderError("sina quote supports CN symbols only")
    code = normalize_cn_code(symbol)
    prefixed = cn_exchange_prefix(code) + code
    headers = {"User-Agent": UA, "Referer": "https://finance.sina.com.cn"}
    resp = requests.get(f"https://hq.sinajs.cn/list={prefixed}", headers=headers, timeout=10)
    resp.raise_for_status()
    text = resp.content.decode("gbk", errors="ignore")
    if '"' not in text:
        raise ProviderError("empty sina response")
    values = text.split('"')[1].split(",")
    if len(values) < 32 or not values[0]:
        raise ProviderError("unexpected sina response shape")
    return {
        "provider": "sina",
        "symbol": code,
        "name": values[0],
        "open": _float(values[1]),
        "previous_close": _float(values[2]),
        "price": _float(values[3]),
        "high": _float(values[4]),
        "low": _float(values[5]),
        "volume": _float(values[8]),
        "amount": _float(values[9]),
        "date": values[30],
        "time": values[31],
    }


def quote_yfinance(symbol: str, market: str, config: Mapping[str, str]) -> Dict[str, Any]:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise ProviderError("install yfinance to use this provider") from exc
    yf_symbol = yfinance_symbol(symbol, market)
    ticker = yf.Ticker(yf_symbol)
    info: Dict[str, Any] = {}
    try:
        fast = ticker.fast_info
        info = {
            "last_price": getattr(fast, "last_price", None),
            "previous_close": getattr(fast, "previous_close", None),
            "open": getattr(fast, "open", None),
            "day_high": getattr(fast, "day_high", None),
            "day_low": getattr(fast, "day_low", None),
            "market_cap": getattr(fast, "market_cap", None),
            "currency": getattr(fast, "currency", None),
        }
    except Exception:
        pass
    if not any(value is not None for value in info.values()):
        hist = ticker.history(period="2d")
        if hist.empty:
            raise ProviderError("empty yfinance quote/history")
        latest = hist.iloc[-1]
        info = {
            "last_price": _float(latest.get("Close")),
            "open": _float(latest.get("Open")),
            "day_high": _float(latest.get("High")),
            "day_low": _float(latest.get("Low")),
            "volume": _float(latest.get("Volume")),
        }
    return {"provider": "yfinance", "symbol": yf_symbol, **info}


def quote_finnhub(symbol: str, market: str, config: Mapping[str, str]) -> Dict[str, Any]:
    token = require_env(config, ["FINNHUB_API_KEY"])
    data = http_get_json("https://finnhub.io/api/v1/quote", params={"symbol": symbol.upper(), "token": token})
    return {
        "provider": "finnhub",
        "symbol": symbol.upper(),
        "price": data.get("c"),
        "change": data.get("d"),
        "change_pct": data.get("dp"),
        "high": data.get("h"),
        "low": data.get("l"),
        "open": data.get("o"),
        "previous_close": data.get("pc"),
        "timestamp": data.get("t"),
    }


def quote_alphavantage(symbol: str, market: str, config: Mapping[str, str]) -> Dict[str, Any]:
    key = require_env(config, ["ALPHAVANTAGE_API_KEY"])
    data = http_get_json("https://www.alphavantage.co/query", params={"function": "GLOBAL_QUOTE", "symbol": symbol.upper(), "apikey": key})
    quote_data = data.get("Global Quote") or {}
    if not quote_data:
        raise ProviderError(str(data)[:300])
    return {
        "provider": "alphavantage",
        "symbol": quote_data.get("01. symbol", symbol.upper()),
        "price": _float(quote_data.get("05. price")),
        "open": _float(quote_data.get("02. open")),
        "high": _float(quote_data.get("03. high")),
        "low": _float(quote_data.get("04. low")),
        "volume": _float(quote_data.get("06. volume")),
        "previous_close": _float(quote_data.get("08. previous close")),
        "change": _float(quote_data.get("09. change")),
        "change_pct": quote_data.get("10. change percent"),
    }


def quote_akshare(symbol: str, market: str, config: Mapping[str, str]) -> Dict[str, Any]:
    try:
        import akshare as ak
    except ImportError as exc:
        raise ProviderError("install akshare to use this provider") from exc
    if market == "hk":
        code = normalize_hk_code(symbol)[2:]
        df = ak.stock_hk_spot_em()
        row = _find_row(df, code)
    elif market == "cn":
        code = normalize_cn_code(symbol)
        df = ak.stock_zh_a_spot_em()
        row = _find_row(df, code)
    else:
        raise ProviderError("akshare quote in this CLI supports CN/HK spot only")
    return {"provider": "akshare", "symbol": symbol, "raw": _series_to_dict(row)}


def quote_efinance(symbol: str, market: str, config: Mapping[str, str]) -> Dict[str, Any]:
    if market != "cn":
        raise ProviderError("efinance quote supports CN symbols only")
    try:
        import efinance as ef
    except ImportError as exc:
        raise ProviderError("install efinance to use this provider") from exc
    code = normalize_cn_code(symbol)
    df = ef.stock.get_realtime_quotes()
    row = _find_row(df, code)
    return {"provider": "efinance", "symbol": code, "raw": _series_to_dict(row)}


def quote_longbridge(symbol: str, market: str, config: Mapping[str, str]) -> Dict[str, Any]:
    try:
        from longport.openapi import Config, QuoteContext
    except ImportError as exc:
        raise ProviderError("install longport and configure Longbridge credentials") from exc
    if not first_env(config, ["LONGBRIDGE_APP_KEY", "LONGBRIDGE_OAUTH_CLIENT_ID", "LONGBRIDGE_OAUTH_TOKEN_CACHE_B64"]):
        raise ProviderError("missing Longbridge credentials")
    lb_symbol = normalize_hk_code(symbol, suffix=True) if market == "hk" else symbol.upper()
    cfg = Config.from_env()
    ctx = QuoteContext(cfg)
    quotes = ctx.quote([lb_symbol])
    first = quotes[0] if quotes else None
    if first is None:
        raise ProviderError("empty longbridge quote")
    return {"provider": "longbridge", "symbol": lb_symbol, "raw": _object_to_dict(first)}


def history_yfinance(symbol: str, market: str, config: Mapping[str, str], days: int) -> Dict[str, Any]:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise ProviderError("install yfinance to use this provider") from exc
    yf_symbol = yfinance_symbol(symbol, market)
    df = yf.download(yf_symbol, period=f"{max(days, 1)}d", progress=False, auto_adjust=False)
    return {"provider": "yfinance", "symbol": yf_symbol, "rows": _df_records(df)}


def history_stooq(symbol: str, market: str, config: Mapping[str, str], days: int) -> Dict[str, Any]:
    stooq_symbol = symbol.lower()
    if market == "us" and "." not in stooq_symbol:
        stooq_symbol = f"{stooq_symbol}.us"
    url = f"https://stooq.com/q/d/l/?s={quote_plus(stooq_symbol)}&i=d"
    resp = requests.get(url, headers={"User-Agent": UA}, timeout=15)
    resp.raise_for_status()
    rows = list(csv.DictReader(io.StringIO(resp.text)))
    if not rows or "Date" not in rows[0]:
        raise ProviderError("unexpected stooq response; provider may be blocking automated access")
    if days > 0:
        rows = rows[-days:]
    return {"provider": "stooq", "symbol": stooq_symbol, "rows": rows}


def history_alphavantage(symbol: str, market: str, config: Mapping[str, str], days: int) -> Dict[str, Any]:
    key = require_env(config, ["ALPHAVANTAGE_API_KEY"])
    data = http_get_json("https://www.alphavantage.co/query", params={"function": "TIME_SERIES_DAILY_ADJUSTED", "symbol": symbol.upper(), "outputsize": "compact", "apikey": key})
    series = data.get("Time Series (Daily)") or {}
    if not series:
        raise ProviderError(str(data)[:300])
    rows = [{"date": date, **values} for date, values in sorted(series.items())]
    return {"provider": "alphavantage", "symbol": symbol.upper(), "rows": rows[-days:]}


def history_akshare(symbol: str, market: str, config: Mapping[str, str], days: int) -> Dict[str, Any]:
    try:
        import akshare as ak
    except ImportError as exc:
        raise ProviderError("install akshare to use this provider") from exc
    end = datetime.now().strftime("%Y%m%d")
    start = (datetime.now() - timedelta(days=max(days * 2, 30))).strftime("%Y%m%d")
    if market == "hk":
        df = ak.stock_hk_hist(symbol=normalize_hk_code(symbol)[2:], period="daily", start_date=start, end_date=end, adjust="")
    elif market == "cn":
        df = ak.stock_zh_a_hist(symbol=normalize_cn_code(symbol), period="daily", start_date=start, end_date=end, adjust="qfq")
    elif market == "us":
        df = ak.stock_us_daily(symbol=symbol.upper(), adjust="qfq")
    else:
        raise ProviderError("unsupported market for akshare history")
    return {"provider": "akshare", "symbol": symbol, "rows": _df_records(df)[-days:]}


def history_efinance(symbol: str, market: str, config: Mapping[str, str], days: int) -> Dict[str, Any]:
    if market != "cn":
        raise ProviderError("efinance history supports CN symbols only")
    try:
        import efinance as ef
    except ImportError as exc:
        raise ProviderError("install efinance to use this provider") from exc
    df = ef.stock.get_quote_history(normalize_cn_code(symbol))
    return {"provider": "efinance", "symbol": normalize_cn_code(symbol), "rows": _df_records(df)[-days:]}


def history_tushare(symbol: str, market: str, config: Mapping[str, str], days: int) -> Dict[str, Any]:
    if market != "cn":
        raise ProviderError("tushare history supports CN symbols only")
    token = require_env(config, ["TUSHARE_TOKEN"])
    try:
        import tushare as ts
    except ImportError as exc:
        raise ProviderError("install tushare to use this provider") from exc
    code = normalize_cn_code(symbol)
    suffix = ".SH" if code.startswith(("5", "6", "9")) else ".SZ"
    ts_code = f"{code}{suffix}"
    pro = ts.pro_api(token)
    start = (datetime.now() - timedelta(days=max(days * 2, 30))).strftime("%Y%m%d")
    end = datetime.now().strftime("%Y%m%d")
    df = pro.daily(ts_code=ts_code, start_date=start, end_date=end)
    return {"provider": "tushare", "symbol": ts_code, "rows": _df_records(df)[-days:]}


def history_baostock(symbol: str, market: str, config: Mapping[str, str], days: int) -> Dict[str, Any]:
    if market != "cn":
        raise ProviderError("baostock history supports CN symbols only")
    try:
        import baostock as bs
    except ImportError as exc:
        raise ProviderError("install baostock to use this provider") from exc
    code = normalize_cn_code(symbol)
    bs_code = ("sh." if code.startswith(("5", "6", "9")) else "sz.") + code
    start = (datetime.now() - timedelta(days=max(days * 2, 30))).strftime("%Y-%m-%d")
    end = datetime.now().strftime("%Y-%m-%d")
    login = bs.login()
    try:
        if login.error_code != "0":
            raise ProviderError(f"baostock login failed: {login.error_msg}")
        rs = bs.query_history_k_data_plus(bs_code, "date,open,high,low,close,volume,amount,pctChg", start_date=start, end_date=end, frequency="d", adjustflag="2")
        rows = []
        while rs.next():
            rows.append(dict(zip(rs.fields, rs.get_row_data())))
        return {"provider": "baostock", "symbol": bs_code, "rows": rows[-days:]}
    finally:
        bs.logout()


def search_anspire(query: str, config: Mapping[str, str], limit: int, days: int) -> Dict[str, Any]:
    key = require_env(config, ["ANSPIRE_API_KEYS"]).split(",")[0].strip()
    now = datetime.now()
    params = {
        "query": query,
        "top_k": min(limit, 50),
        "FromTime": (now - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S"),
        "ToTime": now.strftime("%Y-%m-%d %H:%M:%S"),
    }
    data = http_get_json("https://plugin.anspire.cn/api/ntsearch/search", params=params, headers={"Authorization": f"Bearer {key}", "User-Agent": UA})
    return {"provider": "anspire-search", "query": query, "results": data.get("results", [])[:limit], "raw_status": data.get("code")}


def search_bocha(query: str, config: Mapping[str, str], limit: int, days: int) -> Dict[str, Any]:
    key = require_env(config, ["BOCHA_API_KEYS"]).split(",")[0].strip()
    freshness = "oneDay" if days <= 1 else "oneWeek" if days <= 7 else "oneMonth" if days <= 30 else "oneYear"
    resp = requests.post(
        "https://api.bocha.cn/v1/web-search",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"query": query, "freshness": freshness, "summary": True, "count": min(limit, 50)},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    results = (((data.get("data") or {}).get("webPages") or {}).get("value") or [])[:limit]
    return {"provider": "bocha", "query": query, "results": results, "raw_status": data.get("code")}


def search_tavily(query: str, config: Mapping[str, str], limit: int, days: int) -> Dict[str, Any]:
    key = require_env(config, ["TAVILY_API_KEYS"]).split(",")[0].strip()
    resp = requests.post(
        "https://api.tavily.com/search",
        headers={"Content-Type": "application/json"},
        json={"api_key": key, "query": query, "search_depth": "advanced", "max_results": limit, "days": days},
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()
    return {"provider": "tavily", "query": query, "results": data.get("results", [])[:limit]}


def search_serpapi(query: str, config: Mapping[str, str], limit: int, days: int) -> Dict[str, Any]:
    key = require_env(config, ["SERPAPI_API_KEYS"]).split(",")[0].strip()
    tbs = "qdr:d" if days <= 1 else "qdr:w" if days <= 7 else "qdr:m" if days <= 30 else "qdr:y"
    data = http_get_json("https://serpapi.com/search.json", params={"engine": "google", "q": query, "api_key": key, "num": limit, "tbs": tbs})
    return {"provider": "serpapi", "query": query, "results": data.get("organic_results", [])[:limit]}


def search_brave(query: str, config: Mapping[str, str], limit: int, days: int) -> Dict[str, Any]:
    key = require_env(config, ["BRAVE_API_KEYS"]).split(",")[0].strip()
    data = http_get_json("https://api.search.brave.com/res/v1/web/search", params={"q": query, "count": min(limit, 20)}, headers={"X-Subscription-Token": key, "Accept": "application/json"})
    return {"provider": "brave", "query": query, "results": ((data.get("web") or {}).get("results") or [])[:limit]}


def search_minimax(query: str, config: Mapping[str, str], limit: int, days: int) -> Dict[str, Any]:
    key = require_env(config, ["MINIMAX_API_KEYS"]).split(",")[0].strip()
    resp = requests.post(
        "https://api.minimaxi.com/v1/coding_plan/search",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"query": query, "limit": limit},
        timeout=20,
    )
    resp.raise_for_status()
    return {"provider": "minimax-search", "query": query, "raw": resp.json()}


def search_searxng(query: str, config: Mapping[str, str], limit: int, days: int) -> Dict[str, Any]:
    bases = env_list(config, "SEARXNG_BASE_URLS")
    if not bases:
        raise ProviderError("SEARXNG_BASE_URLS is empty")
    last_error: Optional[Exception] = None
    for base in bases:
        try:
            data = http_get_json(base.rstrip("/") + "/search", params={"q": query, "format": "json", "language": "auto"}, timeout=15)
            return {"provider": "searxng", "query": query, "base_url": base, "results": data.get("results", [])[:limit]}
        except Exception as exc:  # noqa: BLE001
            last_error = exc
    raise ProviderError(f"all SearXNG instances failed: {last_error}")


def social_sentiment(symbol: str, config: Mapping[str, str]) -> Dict[str, Any]:
    key = require_env(config, ["SOCIAL_SENTIMENT_API_KEY"])
    base = (config.get("SOCIAL_SENTIMENT_API_URL") or "https://api.adanos.org").rstrip("/")
    headers = {"Authorization": f"Bearer {key}", "User-Agent": UA}
    paths = [f"/api/v1/sentiment/{symbol.upper()}", f"/sentiment/{symbol.upper()}", f"/ticker/{symbol.upper()}"]
    last_error: Optional[Exception] = None
    for path in paths:
        try:
            data = http_get_json(base + path, headers=headers, timeout=15)
            return {"provider": "social-sentiment", "symbol": symbol.upper(), "endpoint": path, "raw": data}
        except Exception as exc:  # noqa: BLE001
            last_error = exc
    raise ProviderError(f"social sentiment endpoint probe failed: {last_error}")


def stock_index(config: Mapping[str, str], url: Optional[str], limit: int) -> Dict[str, Any]:
    source = url or config.get("STOCK_INDEX_REMOTE_URL") or "https://raw.githubusercontent.com/ZhuLinsen/daily_stock_analysis/main/apps/dsa-web/public/stocks.index.json"
    data = http_get_json(source, timeout=20)
    if not isinstance(data, list):
        raise ProviderError("stock index payload is not a list")
    return {"provider": "stock-index-remote", "url": source, "total": len(data), "sample": data[:limit]}


def check_config(config: Mapping[str, str]) -> Dict[str, Any]:
    rows = []
    for name, meta in sorted(PROVIDERS.items()):
        keys = list(meta.get("keys") or [])
        configured = [key for key in keys if (config.get(key) or "").strip()]
        enabled = not keys or bool(configured)
        if name == "alphasift":
            enabled = (config.get("ALPHASIFT_ENABLED") or "").strip().lower() in {"1", "true", "yes", "on"}
        rows.append({"provider": name, **meta, "enabled": enabled, "configured_keys": configured})
    return {"providers": rows}


def run_auto(names: Sequence[str], fn: Callable[[str], Dict[str, Any]]) -> Dict[str, Any]:
    errors = []
    for name in names:
        try:
            return fn(name)
        except Exception as exc:  # noqa: BLE001
            errors.append({"provider": name, "error": str(exc)})
    raise ProviderError(json.dumps(errors, ensure_ascii=False))


def _float(value: Any) -> Optional[float]:
    try:
        if value is None or value == "":
            return None
        return float(str(value).replace("%", ""))
    except (TypeError, ValueError):
        return None


def _df_records(df: Any) -> List[Dict[str, Any]]:
    if df is None:
        return []
    try:
        if hasattr(df, "reset_index"):
            df = df.reset_index()
        return json.loads(df.to_json(orient="records", force_ascii=False, date_format="iso"))
    except Exception:
        return []


def _series_to_dict(row: Any) -> Dict[str, Any]:
    try:
        return json.loads(row.to_json(force_ascii=False))
    except Exception:
        try:
            return dict(row)
        except Exception:
            return {"value": str(row)}


def _object_to_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    result = {}
    for name in dir(value):
        if name.startswith("_"):
            continue
        item = getattr(value, name)
        if callable(item):
            continue
        try:
            json.dumps(item, default=str)
            result[name] = item
        except TypeError:
            result[name] = str(item)
    return result


def _find_row(df: Any, code: str) -> Any:
    columns = list(getattr(df, "columns", []))
    candidates = ["代码", "证券代码", "symbol", "code", "股票代码"]
    for column in candidates:
        if column in columns:
            mask = df[column].astype(str).str.upper().str.contains(code.upper(), regex=False)
            matched = df[mask]
            if not matched.empty:
                return matched.iloc[0]
    raise ProviderError(f"symbol {code} not found")


QUOTE_FUNCS = {
    "tencent": quote_tencent,
    "sina": quote_sina,
    "yfinance": quote_yfinance,
    "finnhub": quote_finnhub,
    "alphavantage": quote_alphavantage,
    "akshare": quote_akshare,
    "efinance": quote_efinance,
    "longbridge": quote_longbridge,
}

HISTORY_FUNCS = {
    "yfinance": history_yfinance,
    "stooq": history_stooq,
    "alphavantage": history_alphavantage,
    "akshare": history_akshare,
    "efinance": history_efinance,
    "tushare": history_tushare,
    "baostock": history_baostock,
}

SEARCH_FUNCS = {
    "anspire-search": search_anspire,
    "anspire": search_anspire,
    "bocha": search_bocha,
    "tavily": search_tavily,
    "serpapi": search_serpapi,
    "brave": search_brave,
    "minimax-search": search_minimax,
    "minimax": search_minimax,
    "searxng": search_searxng,
}


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", help="Optional .env file loaded after process environment.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("providers")
    sub.add_parser("check-config")

    quote_p = sub.add_parser("quote")
    quote_p.add_argument("symbol")
    quote_p.add_argument("--market", default="auto", choices=["auto", "cn", "hk", "us", "global"])
    quote_p.add_argument("--provider", default="auto")

    hist_p = sub.add_parser("history")
    hist_p.add_argument("symbol")
    hist_p.add_argument("--market", default="auto", choices=["auto", "cn", "hk", "us", "global"])
    hist_p.add_argument("--provider", default="auto")
    hist_p.add_argument("--days", type=int, default=30)

    news_p = sub.add_parser("news")
    news_p.add_argument("query")
    news_p.add_argument("--provider", default="auto")
    news_p.add_argument("--limit", type=int, default=5)
    news_p.add_argument("--days", type=int, default=7)

    social_p = sub.add_parser("social")
    social_p.add_argument("symbol")

    index_p = sub.add_parser("stock-index")
    index_p.add_argument("--url")
    index_p.add_argument("--limit", type=int, default=5)

    args = parser.parse_args(argv)
    config = load_config(args.env)

    try:
        if args.cmd == "providers":
            output(PROVIDERS)
        elif args.cmd == "check-config":
            output(check_config(config))
        elif args.cmd == "quote":
            market = market_of(args.symbol, args.market)
            if args.provider == "auto":
                output(run_auto(QUOTE_PROVIDERS, lambda name: QUOTE_FUNCS[name](args.symbol, market, config)))
            else:
                output(QUOTE_FUNCS[args.provider](args.symbol, market, config))
        elif args.cmd == "history":
            market = market_of(args.symbol, args.market)
            if args.provider == "auto":
                output(run_auto(HISTORY_PROVIDERS, lambda name: HISTORY_FUNCS[name](args.symbol, market, config, args.days)))
            else:
                output(HISTORY_FUNCS[args.provider](args.symbol, market, config, args.days))
        elif args.cmd == "news":
            if args.provider == "auto":
                output(run_auto(NEWS_PROVIDERS, lambda name: SEARCH_FUNCS[name](args.query, config, args.limit, args.days)))
            else:
                output(SEARCH_FUNCS[args.provider](args.query, config, args.limit, args.days))
        elif args.cmd == "social":
            output(social_sentiment(args.symbol, config))
        elif args.cmd == "stock-index":
            output(stock_index(config, args.url, args.limit))
        return 0
    except KeyError as exc:
        print(f"unknown provider: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
