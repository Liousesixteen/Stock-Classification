#!/usr/bin/env python3
"""Synchronize the active A-share universe and SW2021 L1/L2/L3 taxonomy.

The import is deliberately separate from the web request path: the atlas reads a
local, provenance-aware snapshot while this command refreshes that snapshot in a
single transaction.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

try:
    import pandas as pd
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError as error:  # pragma: no cover - operational guard
    raise SystemExit("缺少同步依赖；请使用包含 pandas、requests、xlrd 的 A 股数据环境运行。") from error


TAXONOMY_URL = "https://emt.18.cn/api/quant-help/data/stock.html"
MEMBERSHIP_URL = "https://www.swsresearch.com/swindex/pdf/SwClass2021/StockClassifyUse_stock.xls"
TAXONOMY = "sw2021"
ROOT_CODE = "SW2021"
ROOT_NAME = "A股行业全景（申万2021）"
CODE_ALIASES = {"610101": "610102"}  # 水泥旧三级代码 → 2021 版“水泥制造”


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="同步全量 A 股与申万 2021 三级行业")
    parser.add_argument("--db", default=os.environ.get("STOCK_CLASSIFICATION_DB_PATH", "data/stock-classification.sqlite"))
    parser.add_argument("--stock-index", default=os.environ.get("STOCK_CLASSIFICATION_STOCK_INDEX_PATH", ""))
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def session() -> requests.Session:
    client = requests.Session()
    retry = Retry(total=4, connect=4, read=4, backoff_factor=1.2, status_forcelist=(429, 500, 502, 503, 504))
    client.mount("https://", HTTPAdapter(max_retries=retry))
    client.headers.update({"User-Agent": "Mozilla/5.0", "Referer": "https://www.swsresearch.com/"})
    return client


def resolve_stock_index(explicit: str) -> Path:
    home = Path.home()
    candidates = [
        Path(explicit).expanduser() if explicit else None,
        Path("data/stocks.index.json"),
        home / "DevProjs/DA-Stock/data/cache/stocks.index.json",
        home / "DevProjs/DA-Stock/apps/dsa-web/public/stocks.index.json",
    ]
    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate.resolve()
    raise SystemExit("未找到 stocks.index.json；请通过 --stock-index 指定全市场股票索引。")


def load_active_stocks(path: Path) -> dict[str, dict[str, str]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    allowed_prefixes = ("00", "30", "60", "68", "83", "87", "92")
    stocks: dict[str, dict[str, str]] = {}
    for item in payload:
        if not isinstance(item, list) or len(item) < 10:
            continue
        code, name, market, asset_type, active = str(item[1]), str(item[2]), str(item[6]), str(item[7]), bool(item[8])
        if market not in ("CN", "BSE") or asset_type != "stock" or not active or len(code) != 6 or not code.startswith(allowed_prefixes):
            continue
        stocks[code] = {"code": code, "name": name, "market": "BSE" if market == "BSE" else ("SSE" if code.startswith("6") else "SZSE"), "board": infer_board(code)}
    return stocks


def infer_board(code: str) -> str:
    if code.startswith(("83", "87", "92")):
        return "北交所"
    if code.startswith(("688", "689")):
        return "科创板"
    if code.startswith("30"):
        return "创业板"
    return "沪市主板" if code.startswith("60") else "深市主板"


def fetch_source_data(client: requests.Session):
    taxonomy_response = client.get(TAXONOMY_URL, timeout=45)
    taxonomy_response.raise_for_status()
    tables = pd.read_html(io.StringIO(taxonomy_response.text))
    taxonomy = next(table for table in tables if "三级行业代码" in table.columns)
    taxonomy = taxonomy[["一级行业代码", "一级行业名称", "二级行业代码", "二级行业名称", "三级行业代码", "三级行业名称"]].fillna("")
    for column in ("一级行业代码", "二级行业代码", "三级行业代码"):
        taxonomy[column] = taxonomy[column].astype(str).str.replace(r"\.0$", "", regex=True).str.zfill(6)

    membership_response = client.get(MEMBERSHIP_URL, timeout=60)
    membership_response.raise_for_status()
    history = pd.read_excel(io.BytesIO(membership_response.content), dtype={"股票代码": str, "行业代码": str})
    history = history.rename(columns={"股票代码": "symbol", "计入日期": "start_date", "行业代码": "industry_code", "更新日期": "update_time"})
    history["symbol"] = history["symbol"].astype(str).str.replace(r"\.0$", "", regex=True).str.zfill(6)
    history["industry_code"] = history["industry_code"].astype(str).str.replace(r"\.0$", "", regex=True).str.zfill(6).replace(CODE_ALIASES)
    history["start_date"] = pd.to_datetime(history["start_date"], errors="coerce")
    history["update_time"] = pd.to_datetime(history["update_time"], errors="coerce")
    return taxonomy, history


def latest_memberships(history, active_codes: set[str], third_codes: set[str]):
    valid = history[history["symbol"].isin(active_codes) & history["industry_code"].isin(third_codes)].copy()
    valid = valid.sort_values(["symbol", "start_date", "update_time"], na_position="first")
    return valid.drop_duplicates("symbol", keep="last")


def ensure_sync_columns(db: sqlite3.Connection) -> None:
    additions = {
        "categories": {"taxonomy": "text not null default 'custom'", "external_code": "text not null default ''", "source_url": "text not null default ''", "synced_at": "text not null default ''"},
        "companies": {"market": "text not null default ''", "is_active": "integer not null default 1", "source": "text not null default 'manual'", "synced_at": "text not null default ''"},
        "company_category_relations": {"source": "text not null default 'manual'", "source_url": "text not null default ''", "synced_at": "text not null default ''"},
    }
    for table, columns in additions.items():
        existing = {row[1] for row in db.execute(f"pragma table_info({table})")}
        for name, definition in columns.items():
            if name not in existing:
                db.execute(f"alter table {table} add column {name} {definition}")
    db.execute("create unique index if not exists idx_categories_taxonomy_code on categories(taxonomy, external_code) where external_code != ''")


def upsert_category(db: sqlite3.Connection, *, name: str, parent_id: int | None, level: int, sort_order: int, code: str, description: str, top_industry: str, synced_at: str) -> int:
    row = db.execute("select id from categories where taxonomy = ? and external_code = ?", (TAXONOMY, code)).fetchone()
    if not row:
        row = db.execute(
            "select id from categories where name = ? and ((parent_id = ?) or (parent_id is null and ? is null))",
            (name, parent_id, parent_id),
        ).fetchone()
    values = (name, parent_id, level, sort_order, json.dumps([code], ensure_ascii=False), description, top_industry, TAXONOMY, code, TAXONOMY_URL, synced_at, synced_at)
    if row:
        existing = db.execute("select aliases, external_code from categories where id=?", (row[0],)).fetchone()
        try:
            aliases = list(json.loads(existing[0] or "[]"))
        except (TypeError, json.JSONDecodeError):
            aliases = []
        aliases = list(dict.fromkeys([*aliases, code]))
        canonical_code = existing[1] or code
        merged_values = (name, parent_id, level, sort_order, json.dumps(aliases, ensure_ascii=False), description, top_industry, TAXONOMY, canonical_code, TAXONOMY_URL, synced_at, synced_at)
        db.execute("update categories set name=?, parent_id=?, level=?, sort_order=?, aliases=?, description=?, industry=?, taxonomy=?, external_code=?, source_url=?, synced_at=?, updated_at=?, is_active=1 where id=?", (*merged_values, row[0]))
        return int(row[0])
    cursor = db.execute("insert into categories(name,parent_id,level,sort_order,aliases,description,industry,taxonomy,external_code,source_url,synced_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?)", values)
    return int(cursor.lastrowid)


def synchronize(db: sqlite3.Connection, stocks: dict[str, dict[str, str]], taxonomy, memberships, dry_run: bool) -> dict[str, object]:
    synced_at = datetime.now(timezone.utc).isoformat()
    ensure_sync_columns(db)
    root_id = upsert_category(db, name=ROOT_NAME, parent_id=None, level=0, sort_order=-100, code=ROOT_CODE, description="A 股全市场标准行业入口；一级、二级、三级采用申万 2021 分类。", top_industry="全市场", synced_at=synced_at)
    category_ids: dict[str, int] = {ROOT_CODE: root_id}
    paths: dict[str, tuple[str, str, str]] = {}

    level_specs = [
        ("一级行业代码", "一级行业名称", 1, ROOT_CODE, None),
        ("二级行业代码", "二级行业名称", 2, "一级行业代码", "一级行业名称"),
        ("三级行业代码", "三级行业名称", 3, "二级行业代码", "一级行业名称"),
    ]
    for code_column, name_column, level, parent_column, top_column in level_specs:
        rows = taxonomy[[code_column, name_column] + ([] if parent_column == ROOT_CODE else [parent_column]) + ([] if not top_column or top_column in (name_column, parent_column) else [top_column])].drop_duplicates(code_column).sort_values(code_column)
        for sort_order, (_, item) in enumerate(rows.iterrows()):
            code, name = str(item[code_column]), str(item[name_column])
            parent_code = ROOT_CODE if parent_column == ROOT_CODE else str(item[parent_column])
            parent_id = category_ids[parent_code]
            top_industry = name if level == 1 else str(item.get(top_column, ""))
            category_ids[code] = upsert_category(db, name=name, parent_id=parent_id, level=level, sort_order=sort_order, code=code, description=f"申万 2021 {['', '一级', '二级', '三级'][level]}行业", top_industry=top_industry, synced_at=synced_at)

    for _, item in taxonomy.iterrows():
        paths[str(item["三级行业代码"])] = (str(item["一级行业名称"]), str(item["二级行业名称"]), str(item["三级行业名称"]))

    db.execute("create temporary table if not exists active_a_share_codes(stock_code text primary key)")
    db.execute("delete from active_a_share_codes")
    db.executemany("insert into active_a_share_codes(stock_code) values(?)", ((code,) for code in stocks))
    db.execute("update companies set is_active=0 where source='a-share-universe' and stock_code not in (select stock_code from active_a_share_codes)")

    membership_by_code = {str(row.symbol): row for row in memberships.itertuples()}
    for code, stock in stocks.items():
        membership = membership_by_code.get(code)
        path = paths.get(str(membership.industry_code)) if membership is not None else None
        industry = " / ".join(path) if path else "待分类"
        db.execute(
            """insert into companies(stock_code,short_name,board,industry,market,is_active,source,synced_at,updated_at)
               values(?,?,?,?,?,1,'a-share-universe',?,?)
               on conflict(stock_code) do update set short_name=excluded.short_name, board=excluded.board,
                 industry=excluded.industry, market=excluded.market, is_active=1, source=excluded.source,
                 synced_at=excluded.synced_at, updated_at=excluded.updated_at""",
            (code, stock["name"], stock["board"], industry, stock["market"], synced_at, synced_at),
        )

    db.execute("delete from company_category_relations where source = ?", (TAXONOMY,))
    relation_rows = []
    for row in memberships.itertuples():
        code, industry_code = str(row.symbol), str(row.industry_code)
        category_id = category_ids.get(industry_code)
        if code not in stocks or category_id is None:
            continue
        observed_at = row.start_date.date().isoformat() if pd.notna(row.start_date) else ""
        verified_at = row.update_time.date().isoformat() if pd.notna(row.update_time) else ""
        path = paths[industry_code]
        relation_rows.append((code, category_id, "申万三级行业", "高", f"申万 2021 行业归属：{' / '.join(path)}。", "undirected", 96, observed_at, "verified", verified_at, TAXONOMY, MEMBERSHIP_URL, synced_at, synced_at))
    db.executemany(
        """insert into company_category_relations(stock_code,category_id,relation_type,confidence,rationale,direction,strength,observed_at,verification_status,verified_at,source,source_url,synced_at,updated_at)
           values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           on conflict(stock_code,category_id) do update set relation_type=excluded.relation_type,
             confidence=excluded.confidence,rationale=excluded.rationale,direction=excluded.direction,
             strength=excluded.strength,observed_at=excluded.observed_at,verification_status=excluded.verification_status,
             verified_at=excluded.verified_at,source=excluded.source,source_url=excluded.source_url,
             synced_at=excluded.synced_at,updated_at=excluded.updated_at""",
        relation_rows,
    )

    missing = sorted(set(stocks) - set(membership_by_code))
    level_counts = {int(level): int(count) for level, count in db.execute("select level, count(*) from categories where taxonomy=? and is_active=1 group by level", (TAXONOMY,)).fetchall()}
    result = {
        "companies": len(stocks),
        "mappedCompanies": len(relation_rows),
        "coveragePercent": round(len(relation_rows) / len(stocks) * 100, 2),
        "missingCompanies": [{"stockCode": code, "shortName": stocks[code]["name"]} for code in missing],
        "taxonomy": {"root": level_counts.get(0, 0), "level1": level_counts.get(1, 0), "level2": level_counts.get(2, 0), "level3": level_counts.get(3, 0)},
        "stockIndex": str(resolve_stock_index("")),
        "syncedAt": synced_at,
        "dryRun": dry_run,
    }
    if dry_run:
        db.rollback()
    else:
        db.commit()
    return result


def main() -> None:
    args = parse_args()
    stock_index = resolve_stock_index(args.stock_index)
    stocks = load_active_stocks(stock_index)
    taxonomy, history = fetch_source_data(session())
    memberships = latest_memberships(history, set(stocks), set(taxonomy["三级行业代码"].astype(str)))
    db_path = Path(args.db).expanduser().resolve()
    if not db_path.exists():
        raise SystemExit(f"数据库不存在：{db_path}。请先启动应用完成迁移。")
    db = sqlite3.connect(db_path)
    db.execute("pragma foreign_keys=on")
    try:
        result = synchronize(db, stocks, taxonomy, memberships, args.dry_run)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    result["stockIndex"] = str(stock_index)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
