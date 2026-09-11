#!/usr/bin/env python3
"""Rich System V1.2 — standard-library, local-first investment workbench."""

from __future__ import annotations

import base64
import concurrent.futures
import gzip
import hashlib
import hmac
import html
import json
import math
import os
import re
import secrets
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
CONFIG_PATH = ROOT / "config.json"
STATE_PATH = ROOT / ".dash_state.json"
WATCHLIST_PATH = ROOT / "private" / "watchlist.json"
RUNTIME = ROOT / ".runtime"
TZ = timezone(timedelta(hours=8))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) RichSystem/1.2"


def now_iso() -> str:
    return datetime.now(TZ).isoformat(timespec="seconds")


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{os.getpid()}.{secrets.token_hex(4)}.tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp, path)


def load_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def http_get(url: str, *, headers: dict[str, str] | None = None, timeout: int = 8,
             max_bytes: int = 2_000_000) -> tuple[bytes, dict[str, str]]:
    request = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        length = int(response.headers.get("Content-Length") or 0)
        if length > max_bytes:
            raise ValueError(f"response too large: {length}")
        body = response.read(max_bytes + 1)
        if len(body) > max_bytes:
            raise ValueError("response exceeded size limit")
        return body, dict(response.headers)


def fetch_json(url: str, **kwargs: Any) -> Any:
    body, _ = http_get(url, **kwargs)
    return json.loads(body.decode("utf-8", "replace"))


@dataclass
class CacheEntry:
    value: Any
    built_at: float
    ttl: int
    error: str | None = None


class SWRCache:
    def __init__(self) -> None:
        self._values: dict[str, CacheEntry] = {}
        self._flights: dict[str, threading.Event] = {}
        self._lock = threading.RLock()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            now = time.time()
            return {
                key: {
                    "age_seconds": round(now - entry.built_at, 1),
                    "ttl_seconds": entry.ttl,
                    "stale": now - entry.built_at > entry.ttl,
                    "error": entry.error,
                }
                for key, entry in self._values.items()
            }

    def invalidate(self, *prefixes: str) -> None:
        with self._lock:
            for key in list(self._values):
                if any(key == prefix or key.startswith(prefix) for prefix in prefixes):
                    self._values.pop(key, None)

    def get(self, key: str, ttl: int, builder: Callable[[], Any], *,
            stale_while_revalidate: bool = True) -> tuple[Any, dict[str, Any]]:
        now = time.time()
        with self._lock:
            entry = self._values.get(key)
            if entry and now - entry.built_at <= ttl:
                return entry.value, self._meta(entry, False)
            if entry and stale_while_revalidate:
                if key not in self._flights:
                    event = self._flights[key] = threading.Event()
                    threading.Thread(target=self._build, args=(key, ttl, builder, event), daemon=True).start()
                return entry.value, self._meta(entry, True)
            event = self._flights.get(key)
            owner = event is None
            if owner:
                event = self._flights[key] = threading.Event()
        if owner:
            self._build(key, ttl, builder, event)
        else:
            event.wait(timeout=20)
        with self._lock:
            entry = self._values.get(key)
            if not entry:
                raise RuntimeError(f"cache build failed: {key}")
            return entry.value, self._meta(entry, False)

    def _build(self, key: str, ttl: int, builder: Callable[[], Any], event: threading.Event) -> None:
        error = None
        try:
            value = builder()
            if value is None:
                raise ValueError("builder returned None")
            entry = CacheEntry(value=value, built_at=time.time(), ttl=ttl)
            with self._lock:
                self._values[key] = entry
        except Exception as exc:  # retain last-known-good
            error = f"{type(exc).__name__}: {exc}"
            with self._lock:
                old = self._values.get(key)
                if old:
                    old.error = error
                else:
                    self._values[key] = CacheEntry(
                        value={"status": "unavailable", "reason": error},
                        built_at=time.time(), ttl=min(ttl, 30), error=error,
                    )
        finally:
            with self._lock:
                self._flights.pop(key, None)
                event.set()

    @staticmethod
    def _meta(entry: CacheEntry, stale: bool) -> dict[str, Any]:
        return {
            "built_at": datetime.fromtimestamp(entry.built_at, TZ).isoformat(timespec="seconds"),
            "age_seconds": round(time.time() - entry.built_at, 1),
            "ttl_seconds": entry.ttl,
            "stale": stale,
            "error": entry.error,
        }


CACHE = SWRCache()
STATE_LOCK = threading.RLock()
STARTED_AT = time.time()
LAST_PACKAGE: dict[str, Any] = {"built_at": None, "ok": False, "error": "not built"}


def config() -> dict[str, Any]:
    data = load_json(CONFIG_PATH, {})
    if not isinstance(data, dict) or data.get("持仓模式") != "fund_lookthrough":
        raise ValueError("invalid config or holding mode")
    return data


def portfolio() -> dict[str, Any]:
    cfg = config()
    path = ROOT / cfg["私有持仓文件"]
    data = load_json(path, {})
    if not isinstance(data, dict) or not isinstance(data.get("持仓"), list):
        raise ValueError("invalid private portfolio")
    return data


def normalize_stock_code(raw: Any) -> str:
    value = re.sub(r"[.\s_-]", "", str(raw or "")).lower()
    value = re.sub(r"^(sh|sz|bj)", "", value)
    if not re.fullmatch(r"\d{6}", value):
        raise ValueError("请输入6位A股代码")
    if value.startswith(("600", "601", "603", "605", "688", "689")):
        return "sh" + value
    if value.startswith(("000", "001", "002", "003", "300", "301")):
        return "sz" + value
    if value.startswith(("4", "8", "920")):
        return "bj" + value
    raise ValueError("暂仅支持沪、深、北交易所股票代码")


def stock_watchlist() -> list[dict[str, Any]]:
    base = config().get("股票观察列表", [])
    custom = load_json(WATCHLIST_PATH, {"items": []})
    custom_items = custom.get("items", []) if isinstance(custom, dict) else []
    combined, seen = [], set()
    for item in [*base, *custom_items]:
        code = item.get("tencent") if isinstance(item, dict) else None
        if code and code not in seen:
            combined.append(item)
            seen.add(code)
    return combined


def add_watch_stock(raw_code: Any) -> dict[str, Any]:
    code = normalize_stock_code(raw_code)
    if code in {x.get("tencent") for x in stock_watchlist()}:
        raise ValueError("该股票已在观察列表中")
    payload = load_json(WATCHLIST_PATH, {"items": []})
    items = payload.get("items", []) if isinstance(payload, dict) else []
    if len(items) >= 30:
        raise ValueError("手动观察股票最多30只")
    quote = tencent_quotes([code]).get("items", [])[0]
    item = {
        "name": quote["name"], "tencent": code, "group": "stock",
        "source": "用户手动添加（腾讯行情校验）", "holding": False,
        "user_managed": True, "added_at": now_iso(),
    }
    atomic_json(WATCHLIST_PATH, {"items": [*items, item]})
    CACHE.invalidate("quotes", "all:", "fund_flows", f"stock_flow:{code}")
    return item


def remove_watch_stock(raw_code: Any) -> dict[str, Any]:
    code = normalize_stock_code(raw_code)
    payload = load_json(WATCHLIST_PATH, {"items": []})
    items = payload.get("items", []) if isinstance(payload, dict) else []
    kept = [x for x in items if x.get("tencent") != code]
    if len(kept) == len(items):
        raise ValueError("只能删除手动添加的股票")
    removed = next(x for x in items if x.get("tencent") == code)
    atomic_json(WATCHLIST_PATH, {"items": kept})
    CACHE.invalidate("quotes", "all:", "fund_flows", f"stock_flow:{code}")
    return removed


def market_open(now: datetime | None = None) -> bool:
    dt = now or datetime.now(TZ)
    if dt.weekday() >= 5:
        return False
    hhmm = dt.hour * 100 + dt.minute
    return 915 <= hhmm <= 1130 or 1300 <= hhmm <= 1505


def tencent_quotes(codes: list[str]) -> dict[str, Any]:
    url = "https://qt.gtimg.cn/q=" + ",".join(codes)
    body, _ = http_get(url, timeout=8, max_bytes=500_000)
    text = body.decode("gbk", "replace")
    rows = []
    for line in text.split(";"):
        match = re.search(r'v_([^=]+)="(.*)"', line)
        if not match:
            continue
        values = match.group(2).split("~")
        if len(values) < 53:
            continue
        price = finite(values[3])
        pct = finite(values[32])
        if price is None or pct is None:
            continue
        rows.append({
            "code": match.group(1), "name": values[1], "price": price,
            "prev_close": finite(values[4]), "open": finite(values[5]),
            "change": finite(values[31]), "change_pct": pct,
            "high": finite(values[33]), "low": finite(values[34]),
            "amount_wan": finite(values[37]), "turnover_pct": finite(values[38]),
            "pe_ttm": finite(values[39]), "mcap_yi": finite(values[44]),
            "pb": finite(values[46]), "quote_time": values[30],
            "source": "腾讯财经", "source_kind": "exchange_quote",
        })
    if not rows:
        raise ValueError("empty Tencent quote set")
    return {"status": "ok", "asof": max((r["quote_time"] for r in rows), default=""), "items": rows}


def eastmoney_global_quote(item: dict[str, Any]) -> dict[str, Any]:
    """Fetch one global broad index from Eastmoney's delayed quote node."""
    fields = "f43,f57,f58,f60,f86,f169,f170"
    query = urllib.parse.urlencode({"fltt": 2, "invt": 2, "fields": fields, "secid": item["secid"]})
    errors = []
    for host in ("push2delay.eastmoney.com", "push2.eastmoney.com"):
        try:
            data = fetch_json(f"https://{host}/api/qt/stock/get?{query}", timeout=8)
            row = data.get("data") or {}
            price, pct = finite(row.get("f43")), finite(row.get("f170"))
            if price is None or pct is None:
                raise ValueError("global index record incomplete")
            timestamp = finite(row.get("f86"))
            quote_time = datetime.fromtimestamp(timestamp, TZ).isoformat(timespec="seconds") if timestamp else ""
            return {
                "code": item["code"], "name": item["name"], "price": price,
                "prev_close": finite(row.get("f60")), "change": finite(row.get("f169")),
                "change_pct": pct, "quote_time": quote_time,
                "source": "东方财富全球指数（延迟）", "source_kind": "delayed_index_quote",
                "group": "global", "region": item.get("region", "海外"), "chart_available": False,
            }
        except Exception as exc:
            errors.append(f"{host}: {exc}")
    raise RuntimeError("; ".join(errors))


def fund_nav(code: str) -> dict[str, Any]:
    params = urllib.parse.urlencode({"fundCode": code, "pageIndex": 1, "pageSize": 12})
    data = fetch_json(
        f"https://api.fund.eastmoney.com/f10/lsjz?{params}",
        headers={"Referer": "https://fundf10.eastmoney.com/", "User-Agent": UA}, timeout=10,
    )
    records = []
    for row in ((data.get("Data") or {}).get("LSJZList") or []):
        nav = finite(row.get("DWJZ"))
        pct = finite(row.get("JZZZL"))
        if row.get("FSRQ") and nav is not None:
            records.append({"date": row["FSRQ"], "nav": nav, "acc_nav": finite(row.get("LJJZ")), "pct": pct})
    if not records:
        raise ValueError(f"no official NAV for {code}")
    return {
        "status": "ok", "code": code, "source": "东方财富基金F10（官方净值汇总）",
        "source_kind": "official_nav", "asof": records[0]["date"], "records": records,
        "delay_note": "QDII 净值可能晚一个交易日，页面按净值日期展示",
    }


def fund_disclosure(code: str) -> dict[str, Any]:
    year = datetime.now(TZ).year
    url = (
        "https://fundf10.eastmoney.com/FundArchivesDatas.aspx?"
        + urllib.parse.urlencode({"type": "jjcc", "code": code, "topline": 20, "year": year, "month": 6})
    )
    body, _ = http_get(url, headers={"Referer": f"https://fundf10.eastmoney.com/ccmx_{code}.html"}, timeout=10)
    text = body.decode("utf-8", "replace").replace("\\\"", '"')
    date_match = re.search(r"(20\d{2}-\d{2}-\d{2})", text)
    positions = []
    seen_codes: set[str] = set()
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", text, re.S | re.I):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", cell)).strip() for cell in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)]
        code_match = re.search(r"\b(\d{5,6})\b", " ".join(cells))
        pct_match = next((finite(x.rstrip("%")) for x in cells if re.fullmatch(r"\d+(?:\.\d+)?%", x)), None)
        name = next((x for x in cells if x and not x.isdigit() and "%" not in x and len(x) <= 40), "")
        if code_match and pct_match is not None and name:
            position_code = code_match.group(1)
            if position_code in seen_codes:
                continue
            seen_codes.add(position_code)
            positions.append({"code": position_code, "name": name, "weight_pct": pct_match})
    coverage = round(sum(p["weight_pct"] for p in positions), 2)
    if not positions:
        return {
            "status": "unavailable", "code": code, "source": "公开定期报告汇总",
            "asof": date_match.group(1) if date_match else None,
            "reason": "当前来源未返回可可靠解析的披露持仓；未生成替代数据",
            "positions": [], "coverage_pct": 0, "uncovered_pct": 100,
        }
    return {
        "status": "ok", "code": code, "source": "东方财富基金F10（定期报告披露汇总）",
        "source_kind": "disclosure", "asof": date_match.group(1) if date_match else None,
        "positions": positions, "coverage_pct": min(100, coverage),
        "uncovered_pct": max(0, round(100 - coverage, 2)),
        "note": "仅统计可唯一识别的最新披露成分；披露持仓不是实时持仓，未覆盖部分不按零涨跌计算",
    }


def eastmoney_sectors() -> dict[str, Any]:
    query = urllib.parse.urlencode({
        "pn": 1, "pz": 100, "po": 1, "np": 1, "fltt": 2, "invt": 2,
        "fs": "m:90+t:2", "fields": "f2,f3,f4,f12,f14,f62,f66,f72,f78,f84,f104,f105,f128,f136,f140,f184",
    })
    last_error = None
    for host in ("push2.eastmoney.com", "push2delay.eastmoney.com"):
        try:
            data = fetch_json(f"https://{host}/api/qt/clist/get?{query}", timeout=8)
            items = (data.get("data") or {}).get("diff") or []
            parsed = [{
                "code": str(x.get("f12") or ""), "name": x.get("f14") or "",
                "change_pct": finite(x.get("f3")), "up_count": x.get("f104"),
                "down_count": x.get("f105"), "leader": x.get("f140") or "",
                "leader_change": finite(x.get("f136")),
                "main_net_yuan": finite(x.get("f62")), "main_net_ratio_pct": finite(x.get("f184")),
                "super_net_yuan": finite(x.get("f66")), "large_net_yuan": finite(x.get("f72")),
                "mid_net_yuan": finite(x.get("f78")), "small_net_yuan": finite(x.get("f84")),
            } for x in items if finite(x.get("f3")) is not None]
            if parsed and not all(x["change_pct"] == 0 for x in parsed):
                return {"status": "ok", "source": host, "asof": now_iso(), "items": parsed}
            raise ValueError("empty or all-zero sector package")
        except Exception as exc:
            last_error = str(exc)
    raise RuntimeError(last_error or "sector sources failed")


def parse_stock_flow_lines(raw: list[Any]) -> list[dict[str, Any]]:
    rows = []
    for line in raw:
        parts = str(line).split(",")
        values = [finite(v) for v in parts[1:6]]
        if len(parts) >= 6 and all(v is not None for v in values):
            rows.append({"time": parts[0], "main_net_yuan": values[0], "small_net_yuan": values[1],
                         "mid_net_yuan": values[2], "large_net_yuan": values[3], "super_net_yuan": values[4]})
    return rows


def eastmoney_stock_flow(code: str) -> dict[str, Any]:
    """A-share order-size flow. Minute rows are cumulative snapshots; never sum them."""
    pure = re.sub(r"^(?:sh|sz|bj)", "", code.lower())
    if not re.fullmatch(r"\d{6}", pure):
        raise ValueError("fund flow only supports A-share codes")
    market_id = 1 if pure.startswith(("6", "9")) else 0
    secid = f"{market_id}.{pure}"
    params = urllib.parse.urlencode({
        "secid": secid, "klt": 1, "fields1": "f1,f2,f3,f7",
        "fields2": "f51,f52,f53,f54,f55,f56,f57",
    })
    errors = []
    for host in ("push2.eastmoney.com", "push2delay.eastmoney.com"):
        try:
            data = fetch_json(
                f"https://{host}/api/qt/stock/fflow/kline/get?{params}",
                headers={"Referer": "https://quote.eastmoney.com/", "Origin": "https://quote.eastmoney.com"}, timeout=10,
            )
            raw = ((data.get("data") or {}).get("klines") or [])
            rows = parse_stock_flow_lines(raw)
            if rows:
                latest = rows[-1]
                return {"status": "ok", "code": pure, "asof": latest["time"], "source": "东方财富逐单资金流",
                        "source_kind": "order_size_model", "calculation": "分钟序列为累计快照，取最新点，不跨分钟求和",
                        "latest": latest, "points": len(rows)}
            raise ValueError("empty minute flow")
        except Exception as exc:
            errors.append(f"{host}: {exc}")
    raise RuntimeError("; ".join(errors))


def fund_flow_package(sectors: dict[str, Any]) -> dict[str, Any]:
    cfg = config()
    sector_rows = [x for x in sectors.get("items", []) if finite(x.get("main_net_yuan")) is not None]
    inflow = sorted(sector_rows, key=lambda x: x["main_net_yuan"], reverse=True)[:10]
    outflow = sorted(sector_rows, key=lambda x: x["main_net_yuan"])[:10]
    stock_rows = []
    watch = stock_watchlist()
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(3, max(1, len(watch)))) as pool:
        futures = {pool.submit(CACHE.get, f"stock_flow:{x['tencent']}", cfg["刷新"]["资金流秒"],
                               lambda code=x["tencent"]: eastmoney_stock_flow(code)): x for x in watch}
        for future, item in futures.items():
            try:
                value, meta = future.result()
                stock_rows.append({"name": item["name"], "tencent": item["tencent"], **value, "cache": meta})
            except Exception as exc:
                stock_rows.append({"name": item["name"], "tencent": item["tencent"], "status": "unavailable",
                                   "reason": str(exc), "latest": None})
    ok_stocks = [x for x in stock_rows if x.get("status") == "ok"]
    return {
        "status": "ok" if sector_rows or ok_stocks else "unavailable", "asof": now_iso(),
        "source": "东方财富 push2 逐单资金流", "source_kind": "order_size_model",
        "unit": "yuan", "sector_inflow": inflow, "sector_outflow": outflow, "stocks": stock_rows,
        "note": "资金流为成交单大小分类模型，不等于真实机构账户买卖；分钟值是累计快照，取最新点而非求和。",
    }


def danjuan_valuation(code: str, name: str) -> dict[str, Any]:
    data = fetch_json(
        f"https://danjuanfunds.com/djapi/index_eva/detail/{urllib.parse.quote(code)}",
        headers={"Referer": "https://danjuanfunds.com/", "User-Agent": "Mozilla/5.0 (iPhone)"}, timeout=10,
    )
    row = data.get("data") or {}
    pe = finite(row.get("pe")); percentile = finite(row.get("pe_percentile"))
    if pe is None or percentile is None:
        raise ValueError("PE atomic record incomplete")
    return {
        "name": name, "code": code, "pe_ttm": pe, "percentile": round(percentile * 100, 2),
        "asof": row.get("date"), "source": "蛋卷指数估值", "source_kind": "true_pe",
        "confidence": "高",
    }


def global_news(limit: int = 30) -> dict[str, Any]:
    params = urllib.parse.urlencode({
        "client": "web", "biz": "web_724", "fastColumn": "102", "sortEnd": "",
        "pageSize": limit, "req_trace": str(uuid.uuid4()),
    })
    data = fetch_json(
        f"https://np-weblist.eastmoney.com/comm/web/getFastNewsList?{params}",
        headers={"Referer": "https://kuaixun.eastmoney.com/"}, timeout=8,
    )
    rows = []
    for item in ((data.get("data") or {}).get("fastNewsList") or []):
        title = str(item.get("title") or "").strip()
        if title:
            rows.append({"title": title[:180], "summary": str(item.get("summary") or "")[:260], "time": item.get("showTime")})
    if not rows:
        raise ValueError("empty news feed")
    return {"status": "ok", "source": "东方财富7×24", "asof": now_iso(), "items": rows}


def tencent_kline(code: str, period: str = "day", limit: int = 180) -> dict[str, Any]:
    period = period if period in {"day", "week", "month"} else "day"
    limit = max(20, min(320, limit))
    param = f"{code},{period},,,{limit},qfq"
    url = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?" + urllib.parse.urlencode({"param": param})
    data = fetch_json(url, timeout=10)
    root = (data.get("data") or {}).get(code) or {}
    raw = root.get(f"qfq{period}") or root.get(period) or []
    rows = []
    for values in raw:
        if len(values) >= 6 and all(finite(v) is not None for v in values[1:6]):
            rows.append({"date": values[0], "open": finite(values[1]), "close": finite(values[2]),
                         "high": finite(values[3]), "low": finite(values[4]), "volume": finite(values[5])})
    if not rows:
        raise ValueError("empty kline")
    return {"status": "ok", "code": code, "period": period, "source": "腾讯前复权K线", "items": rows}


def tencent_intraday(code: str) -> dict[str, Any]:
    url = "https://web.ifzq.gtimg.cn/appstock/app/minute/query?" + urllib.parse.urlencode({"code": code})
    data = fetch_json(url, timeout=8)
    root = (data.get("data") or {}).get(code) or {}
    raw = ((root.get("data") or {}).get("data") or [])
    rows: list[dict[str, Any]] = []
    previous_volume = 0.0
    for line in raw:
        values = str(line).split()
        if len(values) < 3:
            continue
        price, cumulative = finite(values[1]), finite(values[2])
        if price is None or cumulative is None:
            continue
        rows.append({
            "time": values[0], "price": price, "volume": max(0, cumulative - previous_volume),
            "cumulative_volume": cumulative, "amount": finite(values[3]) if len(values) > 3 else None,
        })
        previous_volume = cumulative
    if not rows:
        raise ValueError("empty intraday series")
    return {"status": "ok", "code": code, "source": "腾讯分时行情", "items": rows}


def indicators(rows: list[dict[str, Any]]) -> dict[str, Any]:
    closes = [float(x["close"]) for x in rows if x.get("close") is not None]
    if len(closes) < 60:
        return {"status": "insufficient", "reason": "少于60根有效K线"}

    def ema(values: list[float], span: int) -> list[float]:
        alpha = 2 / (span + 1)
        out = [values[0]]
        for value in values[1:]:
            out.append(alpha * value + (1 - alpha) * out[-1])
        return out

    gains, losses = [], []
    for a, b in zip(closes[-15:-1], closes[-14:]):
        delta = b - a
        gains.append(max(delta, 0)); losses.append(max(-delta, 0))
    avg_gain = sum(gains) / 14; avg_loss = sum(losses) / 14
    rsi = 100 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    ema12, ema26 = ema(closes, 12), ema(closes, 26)
    dif = [a - b for a, b in zip(ema12, ema26)]
    dea = ema(dif, 9)
    ma5 = sum(closes[-5:]) / 5; ma20 = sum(closes[-20:]) / 20; ma60 = sum(closes[-60:]) / 60
    ma60_prev = sum(closes[-61:-1]) / 60
    rolling_vols = []
    for end in range(20, len(closes) + 1):
        window = closes[end - 20:end]
        returns = [math.log(b / a) for a, b in zip(window[:-1], window[1:]) if a > 0 and b > 0]
        if len(returns) >= 10:
            mean = sum(returns) / len(returns)
            variance = sum((value - mean) ** 2 for value in returns) / max(1, len(returns) - 1)
            rolling_vols.append(math.sqrt(variance) * math.sqrt(252) * 100)
    current_vol = rolling_vols[-1] if rolling_vols else None
    vol_percentile = (
        sum(value <= current_vol for value in rolling_vols) / len(rolling_vols) * 100
        if current_vol is not None and rolling_vols else None
    )
    extension_pct = (closes[-1] / ma60 - 1) * 100 if ma60 else None
    return {
        "status": "ok", "price": closes[-1], "ma5": round(ma5, 4), "ma20": round(ma20, 4),
        "ma60": round(ma60, 4), "ma60_direction": "up" if ma60 > ma60_prev else "down",
        "above_ma60": closes[-1] >= ma60, "rsi14": round(rsi, 2),
        "ma60_extension_pct": round(extension_pct, 2) if extension_pct is not None else None,
        "volatility_20d_annualized_pct": round(current_vol, 2) if current_vol is not None else None,
        "volatility_percentile": round(vol_percentile, 1) if vol_percentile is not None else None,
        "dif": round(dif[-1], 4), "dea": round(dea[-1], 4),
        "macd": "gold" if dif[-1] >= dea[-1] else "dead",
    }


def valuation_package(cfg: dict[str, Any]) -> dict[str, Any]:
    items = []
    for row in cfg["估值监测"]["宽基"]:
        try:
            items.append(danjuan_valuation(row["valuation"], row["name"]))
        except Exception as exc:
            items.append({"name": row["name"], "code": row["valuation"], "status": "unavailable", "reason": str(exc), "confidence": "低"})
    thresholds = cfg["估值监测"]["阈值"]
    for row in items:
        pct = finite(row.get("percentile"))
        if pct is None:
            row["level"] = "数据不足"
        elif pct >= thresholds["高估"]: row["level"] = "高估"
        elif pct >= thresholds["偏高"]: row["level"] = "偏高"
        elif pct <= thresholds["低估"]: row["level"] = "低估"
        elif pct <= thresholds["偏低"]: row["level"] = "偏低"
        else: row["level"] = "适中"
    return {"status": "ok" if any(x.get("percentile") is not None for x in items) else "degraded", "items": items}


def portfolio_package(public: bool = False) -> dict[str, Any]:
    data = portfolio()
    holdings = []
    disclosures = []
    official_count = 0
    for row in data["持仓"]:
        nav, nav_meta = CACHE.get(f"fund_nav:{row['code']}", 3600, lambda code=row["code"]: fund_nav(code))
        disclosure, disclosure_meta = CACHE.get(
            f"disclosure:{row['code']}", 86400, lambda code=row["code"]: fund_disclosure(code)
        )
        if nav.get("status") == "ok": official_count += 1
        item = {
            "name": row["name"], "code": row["code"], "share_class": row["share_class"],
            "asset_type": row["asset_type"], "currency": row["currency"],
            "weight_pct": round(row["market_value"] / data["基准总市值_元"] * 100, 2),
            "market_value": None if public else row["market_value"],
            "cost_basis": None if public else row["cost_basis"],
            "unrealized_pnl": None if public else row["unrealized_pnl"],
            "unrealized_pnl_pct": row["unrealized_pnl_pct"],
            "identity_verified": row["identity_verified"], "amount_verified": row["amount_verified"],
            "asof_verified": row["asof_verified"], "decision_eligible": row["decision_eligible"],
            "official_nav": nav, "nav_cache": nav_meta, "note": row["note"],
            "source_kind": "official_nav" if nav.get("status") == "ok" else "unavailable",
        }
        holdings.append(item)
        normalized_disclosure = {
            "status": "unavailable", "source": "公开定期报告汇总", "positions": [],
            "coverage_pct": 0, "uncovered_pct": 100, "reason": "披露源暂不可用；未生成替代数据",
            **disclosure,
        }
        normalized_disclosure["positions"] = normalized_disclosure.get("positions") or []
        normalized_disclosure["coverage_pct"] = finite(normalized_disclosure.get("coverage_pct")) or 0
        normalized_disclosure["uncovered_pct"] = finite(normalized_disclosure.get("uncovered_pct"))
        if normalized_disclosure["uncovered_pct"] is None:
            normalized_disclosure["uncovered_pct"] = max(0, 100 - normalized_disclosure["coverage_pct"])
        disclosures.append({"code": row["code"], "name": row["name"], **normalized_disclosure, "cache": disclosure_meta})
    n = len(holdings)
    coverage = {
        "identity_pct": round(sum(x["identity_verified"] for x in holdings) / n * 100, 1) if n else 0,
        "amount_pct": round(sum(x["amount_verified"] for x in holdings) / n * 100, 1) if n else 0,
        "asof_pct": round(sum(x["asof_verified"] for x in holdings) / n * 100, 1) if n else 0,
        "intraday_estimate_pct": 0.0,
        "official_settlement_pct": round(official_count / n * 100, 1) if n else 0,
        "lookthrough_pct": round(sum(x.get("coverage_pct", 0) for x in disclosures) / n, 1) if n else 0,
    }
    return {
        "status": "locked" if coverage["asof_pct"] < 100 else "ok", "mode": "fund_lookthrough",
        "asof": data.get("基准日"), "received_at": data.get("接收时间"),
        "total_market_value": None if public else data.get("基准总市值_元"),
        "cash": None if public else data.get("现金_元"), "holdings": holdings,
        "disclosures": disclosures, "coverage": coverage,
        "gate_reason": "截图日期未显示，个性化动作保持锁定" if coverage["asof_pct"] < 100 else None,
    }


def market_package() -> dict[str, Any]:
    cfg = config()
    global_indices = cfg.get("全球大盘指数", [])
    tencent_global = [x for x in global_indices if x.get("provider") == "tencent"]
    em_global = [x for x in global_indices if x.get("provider") == "eastmoney"]
    instruments = stock_watchlist() + cfg["宽基指数"] + cfg["行业板块"] + tencent_global
    quotes, meta = CACHE.get("quotes", cfg["刷新"]["行情秒"], lambda: tencent_quotes([x["tencent"] for x in instruments]))
    lookup = {x["tencent"]: x for x in instruments}
    for item in quotes.get("items", []):
        item.update({k: v for k, v in lookup.get(item["code"], {}).items() if k not in item})
    global_rows = []
    if em_global:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(3, len(em_global))) as pool:
            futures = {pool.submit(CACHE.get, f"global_quote:{x['code']}", cfg["刷新"]["行情秒"],
                                   lambda item=x: eastmoney_global_quote(item)): x for x in em_global}
            for future, item in futures.items():
                try:
                    value, _ = future.result()
                    global_rows.append(value)
                except Exception as exc:
                    global_rows.append({
                        "code": item["code"], "name": item["name"], "price": None, "change_pct": None,
                        "quote_time": "", "source": "东方财富全球指数（延迟）", "group": "global",
                        "region": item.get("region", "海外"), "chart_available": False,
                        "status": "unavailable", "reason": str(exc),
                    })
    all_items = quotes.get("items", []) + global_rows
    order = [x["tencent"] for x in cfg["宽基指数"]] + [x.get("tencent") or x.get("code") for x in global_indices]
    by_code = {x.get("code"): x for x in all_items}
    overview_items = [by_code[code] for code in order if code in by_code]
    return {**quotes, "items": all_items, "overview_items": overview_items, "cache": meta,
            "overview_scope": "国内与全球大盘指数（不含个股和ETF）"}


def signal_package(market: dict[str, Any]) -> dict[str, Any]:
    cfg = config(); watch = set(cfg.get("条件观察指数", [])); results = []
    quote_lookup = {x.get("code"): x for x in market.get("items", [])}
    for code in watch:
        try:
            kline, meta = CACHE.get(f"kline:{code}:day", 300, lambda code=code: tencent_kline(code))
            ind = indicators(kline.get("items", []))
            if ind.get("status") == "ok":
                all_ok = ind["above_ma60"] and ind["ma60_direction"] == "up" and ind["rsi14"] < 70 and ind["macd"] == "gold"
                some_ok = sum([ind["above_ma60"], ind["ma60_direction"] == "up", ind["rsi14"] < 70, ind["macd"] == "gold"]) >= 2
                verdict = "条件全部成立" if all_ok else ("部分成立" if some_ok else "条件未成立")
            else: verdict = "数据不足"
            results.append({"code": code, "name": quote_lookup.get(code, {}).get("name", code), "verdict": verdict, "indicator": ind, "cache": meta})
        except Exception as exc:
            results.append({"code": code, "name": code, "verdict": "数据不足", "reason": str(exc)})
    return {"status": "ok" if results else "unavailable", "items": results}


def bull_top_package(valuations: dict[str, Any], market: dict[str, Any], signals: dict[str, Any],
                     sectors: dict[str, Any]) -> dict[str, Any]:
    weights = config().get("见顶信号", {}).get("维度权重", {"估值": 30, "情绪换手": 20, "技术动能": 20, "宽度结构": 20, "波动率": 10})
    percentiles = [x["percentile"] for x in valuations.get("items", []) if finite(x.get("percentile")) is not None]
    valuation_heat = sum(percentiles) / len(percentiles) if percentiles else None
    top_watch = set(config().get("系统顶部观察指数", []))
    signal_rows = [x for x in signals.get("items", []) if x.get("code") in top_watch and x.get("indicator", {}).get("status") == "ok"]
    technical_components = []
    volatility_components = []
    for row in signal_rows:
        indicator = row["indicator"]
        rsi = finite(indicator.get("rsi14")); extension = finite(indicator.get("ma60_extension_pct"))
        if rsi is not None and extension is not None:
            rsi_heat = max(0, min(100, (rsi - 50) * 3.33))
            extension_heat = max(0, min(100, extension / 20 * 100))
            technical_components.append((rsi_heat + extension_heat) / 2)
        vol_pct = finite(indicator.get("volatility_percentile"))
        if vol_pct is not None:
            volatility_components.append(vol_pct)
    technical_heat = sum(technical_components) / len(technical_components) if technical_components else None
    volatility_heat = sum(volatility_components) / len(volatility_components) if volatility_components else None
    sector_rows = [x for x in sectors.get("items", []) if finite(x.get("up_count")) is not None and finite(x.get("down_count")) is not None]
    total_up = sum(finite(x.get("up_count")) or 0 for x in sector_rows)
    total_down = sum(finite(x.get("down_count")) or 0 for x in sector_rows)
    breadth_heat = total_up / (total_up + total_down) * 100 if total_up + total_down else None
    dims = [
        {"name": "估值", "heat": round(valuation_heat, 1) if valuation_heat is not None else None,
         "coverage": f"{len(percentiles)}/3", "method": "沪深300 / 上证50 / 中证500 PE历史分位"},
        {"name": "情绪换手", "heat": None, "coverage": "0/3", "missing": ["融资余额", "散户开户", "换手分位"],
         "method": "缺失项不补零、不用代理冒充"},
        {"name": "技术动能", "heat": round(technical_heat, 1) if technical_heat is not None else None,
         "coverage": f"{len(technical_components)}/{len(top_watch)}", "method": "RSI热度 + 偏离M60幅度"},
        {"name": "宽度结构", "heat": round(breadth_heat, 1) if breadth_heat is not None else None,
         "coverage": f"{len(sector_rows)}/100", "method": "行业上涨家数 / 上涨与下跌家数"},
        {"name": "波动率", "heat": round(volatility_heat, 1) if volatility_heat is not None else None,
         "coverage": f"{len(volatility_components)}/{len(top_watch)}", "method": "20日年化波动率在当前K线窗口的历史分位"},
    ]
    available = [(d["heat"], weights.get(d["name"], 0)) for d in dims if d["heat"] is not None]
    score = round(sum(h * w for h, w in available) / sum(w for _, w in available), 1) if available else None
    covered_weight = sum(w for _, w in available)
    published_score = score if covered_weight >= 70 and len(available) >= 4 else None
    confidence = "中" if covered_weight >= 70 else "低"
    level = "数据不足" if published_score is None else ("危险" if published_score >= 70 else "警惕" if published_score >= 50 else "安全")
    return {"status": "ok" if covered_weight == 100 else "degraded", "score": published_score,
            "partial_score": score, "coverage_weight_pct": covered_weight, "confidence": confidence,
            "level": level, "dimensions": dims,
            "note": f"当前覆盖权重 {covered_weight}% · 置信度{confidence}；缺失维度不补零，单一维度极端不等于见顶"}


def build_all(public: bool = False) -> dict[str, Any]:
    global LAST_PACKAGE
    try:
        market = market_package()
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            sector_f = pool.submit(lambda: CACHE.get("sectors", 30, eastmoney_sectors))
            news_f = pool.submit(lambda: CACHE.get("news", 60, global_news))
            valuation_f = pool.submit(lambda: CACHE.get("valuations", 3600, lambda: valuation_package(config())))
            portfolio_f = pool.submit(portfolio_package, public)
            sectors, sectors_meta = sector_f.result()
            news, news_meta = news_f.result()
            valuations, valuations_meta = valuation_f.result()
            holdings = portfolio_f.result()
        signals = signal_package(market)
        package = {
            "version": "1.2.0", "built_at": now_iso(), "default_view": config().get("默认视图", "stock"),
            "market_state": "交易中" if market_open() else "休市",
            "market": market, "sectors": {**sectors, "cache": sectors_meta}, "portfolio": holdings,
            "fund_flows": fund_flow_package(sectors),
            "signals": signals, "valuations": {**valuations, "cache": valuations_meta},
            "bull_top": bull_top_package(valuations, market, signals, sectors), "news": {**news, "cache": news_meta},
            "sources": ["腾讯财经", "东方财富全球指数（延迟）", "东方财富逐单资金流", "东方财富基金F10", "东方财富板块/新闻", "蛋卷指数估值"],
            "risk_notice": "本工具用于信息整理与条件观察，不保证收益，不替用户下单；正式数据以交易所、基金公司、券商和官方披露为准。",
        }
        LAST_PACKAGE = {"built_at": time.time(), "ok": True, "error": None}
        update_state(package)
        return package
    except Exception as exc:
        LAST_PACKAGE = {"built_at": time.time(), "ok": False, "error": f"{type(exc).__name__}: {exc}"}
        raise


def update_state(package: dict[str, Any]) -> None:
    with STATE_LOCK:
        prior = load_json(STATE_PATH, {"signals": {}, "valuation_levels": {}, "events": []})
        events = list(prior.get("events", []))[-99:]
        levels = dict(prior.get("valuation_levels", {}))
        for item in package.get("valuations", {}).get("items", []):
            code, level = item.get("code"), item.get("level")
            if not code or not level: continue
            old = levels.get(code)
            if old and old != level and ({old, level} & {"高估", "低估"}):
                events.append({"kind": "valuation_flip", "code": code, "from": old, "to": level,
                               "asof": item.get("asof"), "source": item.get("source"), "at": now_iso()})
            levels[code] = level
        atomic_json(STATE_PATH, {"valuation_levels": levels, "events": events, "updated_at": now_iso()})


def ready_status() -> tuple[dict[str, Any], int]:
    cfg = config(); hard = cfg["缓存"]["硬过期秒"]
    built = LAST_PACKAGE.get("built_at")
    age = time.time() - built if built else None
    reasons = []
    if not LAST_PACKAGE.get("ok"): reasons.append(LAST_PACKAGE.get("error") or "last package failed")
    if age is None: reasons.append("首包尚未完成")
    elif age > hard: reasons.append(f"关键数据硬过期：{round(age)}s")
    data = {"ready": not reasons, "reasons": reasons, "last_package_age_seconds": round(age, 1) if age is not None else None,
            "checked_at": now_iso()}
    return data, 200 if not reasons else 503


def is_loopback(handler: BaseHTTPRequestHandler) -> bool:
    if handler.headers.get("X-Forwarded-For") or handler.headers.get("X-Real-IP"):
        return False
    try:
        return handler.client_address[0] in {"127.0.0.1", "::1"}
    except Exception:
        return False


class Handler(BaseHTTPRequestHandler):
    server_version = "RichSystem/1.2"

    def log_message(self, fmt: str, *args: Any) -> None:
        safe_path = self.path.split("?", 1)[0]
        sys.stderr.write(f"[{now_iso()}] {self.client_address[0]} {self.command} {safe_path} {fmt % args}\n")

    def _authorized(self) -> bool:
        if is_loopback(self): return True
        user, password = os.environ.get("RICH_USER"), os.environ.get("RICH_PASSWORD")
        if not user or not password: return False
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Basic "): return False
        try:
            decoded = base64.b64decode(auth[6:], validate=True).decode("utf-8")
            got_user, got_password = decoded.split(":", 1)
        except Exception: return False
        return hmac.compare_digest(got_user, user) and hmac.compare_digest(got_password, password)

    def _headers(self, status: int, content_type: str, body: bytes, *, cache: str = "no-store") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'")
        self.end_headers()

    def json(self, payload: Any, status: int = 200) -> None:
        raw = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()
        if "gzip" in self.headers.get("Accept-Encoding", "") and len(raw) > 800:
            raw = gzip.compress(raw)
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers(); self.wfile.write(raw); return
        self._headers(status, "application/json; charset=utf-8", raw)
        self.wfile.write(raw)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/") and not self._authorized():
            self.send_response(401); self.send_header("WWW-Authenticate", 'Basic realm="Rich System"')
            body = b'{"error":"authentication required"}'
            self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        try:
            if path == "/api/health":
                return self.json({"alive": True, "version": "1.2.0", "uptime_seconds": round(time.time() - STARTED_AT, 1), "time": now_iso()})
            if path == "/api/ready":
                payload, status = ready_status(); return self.json(payload, status)
            if path == "/api/all":
                ttl = config()["缓存"]["完整包交易秒" if market_open() else "完整包休市秒"]
                external = not is_loopback(self)
                cache_key = "all:public" if external else "all:private"
                data, meta = CACHE.get(cache_key, ttl, lambda: build_all(public=external))
                return self.json({**data, "package_cache": meta})
            if path == "/api/realtime":
                return self.json(market_package())
            if path == "/api/fund-flow":
                sectors, _ = CACHE.get("sectors", 30, eastmoney_sectors)
                data, meta = CACHE.get("fund_flows", config()["刷新"]["资金流秒"], lambda: fund_flow_package(sectors))
                return self.json({**data, "cache": meta})
            if path == "/api/portfolio-realtime":
                return self.json({"status": "unavailable", "asof": now_iso(), "coverage_pct": 0,
                                  "reason": "两项均为 QDII；没有可靠盘中基金估算，不用代理冒充账户盈亏"})
            if path in {"/api/kline", "/api/intraday"}:
                query = urllib.parse.parse_qs(parsed.query); code = query.get("code", ["sh000300"])[0]
                if not re.fullmatch(r"(?:sh|sz|bj|hk|us)[A-Za-z0-9.]+", code): return self.json({"error": "invalid code"}, 400)
                if path == "/api/intraday":
                    data, meta = CACHE.get(f"intraday:{code}", 20, lambda: tencent_intraday(code))
                    return self.json({**data, "cache": meta})
                period = query.get("period", ["day"])[0]
                data, meta = CACHE.get(f"kline:{code}:{period}", 300, lambda: tencent_kline(code, period))
                return self.json({**data, "cache": meta})
            if path == "/api/rsi-margin":
                query = urllib.parse.parse_qs(parsed.query); code = query.get("code", ["sh000300"])[0]
                data, meta = CACHE.get(f"kline:{code}:day", 300, lambda: tencent_kline(code))
                return self.json({"code": code, "indicator": indicators(data.get("items", [])), "cache": meta})
            if path == "/api/news":
                data, meta = CACHE.get("news", 60, global_news); return self.json({**data, "cache": meta})
            if path == "/api/us":
                data = tencent_quotes(["usNDX", "usDJI", "usINX"]); return self.json(data)
            return self.serve_static(path)
        except Exception as exc:
            return self.json({"error": type(exc).__name__, "message": str(exc), "time": now_iso()}, 503)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/watchlist":
            return self.json({"error": "not found"}, 404)
        if not self._authorized():
            return self.json({"error": "authentication required"}, 401)
        origin = self.headers.get("Origin")
        if origin and urllib.parse.urlparse(origin).netloc != self.headers.get("Host"):
            return self.json({"error": "origin rejected"}, 403)
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length < 2 or length > 4096:
                return self.json({"error": "invalid request size"}, 400)
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            action = payload.get("action")
            if action == "add":
                item = add_watch_stock(payload.get("code"))
            elif action == "remove":
                item = remove_watch_stock(payload.get("code"))
            else:
                return self.json({"error": "invalid action"}, 400)
            return self.json({"status": "ok", "action": action, "item": item, "items": stock_watchlist()})
        except ValueError as exc:
            return self.json({"error": "invalid stock", "message": str(exc)}, 400)
        except Exception as exc:
            return self.json({"error": type(exc).__name__, "message": str(exc), "time": now_iso()}, 503)

    def serve_static(self, path: str) -> None:
        relative = "index.html" if path == "/" else path.lstrip("/")
        target = (WEB / relative).resolve()
        if WEB.resolve() not in target.parents and target != WEB.resolve():
            return self.json({"error": "not found"}, 404)
        if not target.is_file(): return self.json({"error": "not found"}, 404)
        raw = target.read_bytes(); etag = '"' + hashlib.sha256(raw).hexdigest()[:24] + '"'
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304); self.send_header("ETag", etag); self.end_headers(); return
        mime = {".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml"}.get(target.suffix, "application/octet-stream")
        encoded = gzip.compress(raw) if "gzip" in self.headers.get("Accept-Encoding", "") and len(raw) > 800 else raw
        self.send_response(200); self.send_header("Content-Type", mime); self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-cache" if target.suffix == ".html" else "public, max-age=3600")
        self.send_header("ETag", etag); self.send_header("X-Content-Type-Options", "nosniff")
        if encoded is not raw: self.send_header("Content-Encoding", "gzip")
        self.end_headers(); self.wfile.write(encoded)


def prewarm() -> None:
    try:
        CACHE.get("all:private", 1, lambda: build_all(public=False), stale_while_revalidate=False)
    except Exception as exc:
        sys.stderr.write(f"prewarm degraded: {exc}\n")


def main() -> None:
    cfg = config(); host = cfg.get("监听地址", "127.0.0.1"); port = int(cfg.get("端口", 8765))
    RUNTIME.mkdir(exist_ok=True)
    try:
        server = ThreadingHTTPServer((host, port), Handler)
    except OSError as exc:
        raise SystemExit(f"无法监听 {host}:{port}：{exc}。请用 lsof -nP -iTCP:{port} 查找占用者。")
    threading.Thread(target=prewarm, daemon=True).start()
    print(f"Rich System running at http://127.0.0.1:{port}")
    if not os.environ.get("RICH_USER") or not os.environ.get("RICH_PASSWORD"):
        print("Authentication credentials are unset; only loopback clients are trusted.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
