#!/usr/bin/env python3
"""Incrementally import a classified A-share workbook into the atlas database.

The importer is deliberately additive: it never deletes or rewrites an existing
category relation. Existing company names and research fields are preserved,
while missing companies, category paths and exact workbook memberships are added.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

try:
    from openpyxl import load_workbook
except ImportError as exc:  # pragma: no cover - depends on the local runtime
    raise SystemExit("缺少 openpyxl；请使用项目配置的 Python 运行时或安装 openpyxl。") from exc


STOCK_SHEETS = (
    "核心股池·60日",
    "备选观察池·60日",
    "S级标杆·60日",
    "核心股池·120日",
    "S级标杆·120日",
)
REQUIRED_HEADERS = ("一级行业", "二级板块", "三级细分", "代码", "名称")
ROOT_NAME = "A股行业全景（申万2021）"
SOURCE = "user-workbook"


@dataclass
class StockRecord:
    code: str
    name: str
    path: tuple[str, str, str]
    sheets: set[str] = field(default_factory=set)


def clean_text(value: object) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def normalize_code(value: object) -> str:
    text = clean_text(value).upper()
    text = re.sub(r"\.(SH|SZ|BJ)$", "", text)
    if text.endswith(".0") and text[:-2].isdigit():
        text = text[:-2]
    if text.isdigit():
        text = text.zfill(6)
    if not re.fullmatch(r"\d{6}", text):
        raise ValueError(f"无效股票代码：{value!r}")
    return text


def find_header_row(sheet) -> tuple[int, dict[str, int]]:
    for row_number in range(1, min(sheet.max_row, 12) + 1):
        values = [clean_text(cell.value) for cell in sheet[row_number]]
        if all(header in values for header in REQUIRED_HEADERS):
            return row_number, {value: index for index, value in enumerate(values) if value}
    raise ValueError(f"工作表 {sheet.title!r} 未找到所需表头：{', '.join(REQUIRED_HEADERS)}")


def read_workbook(path: Path) -> tuple[dict[str, StockRecord], dict[str, int]]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    stocks: dict[str, StockRecord] = {}
    stats = {"sourceRows": 0, "duplicateRows": 0}
    try:
        missing_sheets = [name for name in STOCK_SHEETS if name not in workbook.sheetnames]
        if missing_sheets:
            raise ValueError(f"工作簿缺少股票表：{', '.join(missing_sheets)}")

        for sheet_name in STOCK_SHEETS:
            sheet = workbook[sheet_name]
            header_row, columns = find_header_row(sheet)
            for values in sheet.iter_rows(min_row=header_row + 1, values_only=True):
                code_value = values[columns["代码"]] if columns["代码"] < len(values) else None
                if code_value is None or clean_text(code_value) == "":
                    continue
                code = normalize_code(code_value)
                name = clean_text(values[columns["名称"]])
                path_parts = tuple(clean_text(values[columns[key]]) for key in REQUIRED_HEADERS[:3])
                if not name or any(not part for part in path_parts):
                    raise ValueError(f"{sheet_name} 中 {code} 的名称或行业层级为空")
                stats["sourceRows"] += 1
                existing = stocks.get(code)
                if existing:
                    stats["duplicateRows"] += 1
                    if existing.path != tuple(path_parts):
                        raise ValueError(
                            f"股票 {code} 在工作簿中存在冲突分类：{' / '.join(existing.path)} 与 {' / '.join(path_parts)}"
                        )
                    existing.sheets.add(sheet_name)
                    continue
                stocks[code] = StockRecord(code=code, name=name, path=tuple(path_parts), sheets={sheet_name})
    finally:
        workbook.close()
    return stocks, stats


def infer_market_and_board(code: str) -> tuple[str, str]:
    if code.startswith(("4", "8", "9")):
        return "BJ", "北交所"
    if code.startswith(("300", "301")):
        return "SZ", "创业板"
    if code.startswith(("688", "689")):
        return "SH", "科创板"
    if code.startswith(("5", "6", "9")):
        return "SH", "沪市主板"
    return "SZ", "深市主板"


def category_id(db: sqlite3.Connection, name: str, parent_id: int | None) -> int | None:
    row = db.execute(
        """select id from categories
           where name = ? and ((parent_id = ?) or (parent_id is null and ? is null))
           order by is_active desc, id limit 1""",
        (name, parent_id, parent_id),
    ).fetchone()
    return int(row[0]) if row else None


def get_root_id(db: sqlite3.Connection) -> int:
    row = db.execute(
        """select id from categories
           where (taxonomy = 'sw2021' and external_code = 'SW2021') or (name = ? and parent_id is null)
           order by case when taxonomy = 'sw2021' then 0 else 1 end, id limit 1""",
        (ROOT_NAME,),
    ).fetchone()
    if not row:
        raise ValueError(f"数据库中找不到星图行业根节点：{ROOT_NAME}")
    return int(row[0])


def ensure_category_path(
    db: sqlite3.Connection,
    root_id: int,
    path: tuple[str, str, str],
    source_ref: str,
    timestamp: str,
    created: list[str],
) -> int:
    parent_id = root_id
    for level, name in enumerate(path, start=1):
        existing_id = category_id(db, name, parent_id)
        if existing_id is not None:
            parent_id = existing_id
            continue
        sort_order = int(
            db.execute("select coalesce(max(sort_order), -1) + 1 from categories where parent_id = ?", (parent_id,)).fetchone()[0]
        )
        cursor = db.execute(
            """insert into categories(
                 name,parent_id,level,sort_order,aliases,description,industry,is_active,
                 taxonomy,external_code,source_url,synced_at,updated_at
               ) values(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                name,
                parent_id,
                level,
                sort_order,
                "[]",
                f"用户提供工作簿中的行业分类层级（第 {level} 级）。",
                path[0],
                1,
                SOURCE,
                "",
                source_ref,
                timestamp,
                timestamp,
            ),
        )
        parent_id = int(cursor.lastrowid)
        created.append(" / ".join(path[:level]))
    return parent_id


def import_records(
    db: sqlite3.Connection,
    stocks: dict[str, StockRecord],
    workbook: Path,
    dry_run: bool,
    workbook_stats: dict[str, int],
) -> dict[str, object]:
    db.execute("pragma foreign_keys = on")
    db.execute("pragma busy_timeout = 5000")
    timestamp = datetime.now(timezone.utc).isoformat()
    source_ref = f"workbook:{workbook.name}"
    root_id = get_root_id(db)
    created_categories: list[str] = []
    missing_companies = 0
    existing_companies = 0
    inserted_relations = 0
    existing_relations = 0
    exact_path_cache: dict[tuple[str, str, str], int] = {}

    db.execute("begin immediate")
    try:
        for record in stocks.values():
            leaf_id = exact_path_cache.get(record.path)
            if leaf_id is None:
                leaf_id = ensure_category_path(
                    db, root_id, record.path, source_ref, timestamp, created_categories
                )
                exact_path_cache[record.path] = leaf_id

            company = db.execute("select 1 from companies where stock_code = ?", (record.code,)).fetchone()
            industry = " / ".join(record.path)
            if company:
                existing_companies += 1
                # Classification is the requested user-supplied field; all other
                # company facts and the potentially newer security name stay intact.
                db.execute(
                    "update companies set industry = ?, is_active = 1, updated_at = ? where stock_code = ?",
                    (industry, timestamp, record.code),
                )
            else:
                missing_companies += 1
                market, board = infer_market_and_board(record.code)
                db.execute(
                    """insert into companies(
                         stock_code,short_name,board,industry,market,is_active,source,synced_at,updated_at
                       ) values(?,?,?,?,?,1,?,?,?)""",
                    (record.code, record.name, board, industry, market, SOURCE, timestamp, timestamp),
                )

            relation = db.execute(
                "select id from company_category_relations where stock_code = ? and category_id = ?",
                (record.code, leaf_id),
            ).fetchone()
            if relation:
                existing_relations += 1
                continue
            pools = "、".join(sorted(record.sheets))
            db.execute(
                """insert into company_category_relations(
                     stock_code,category_id,relation_type,confidence,rationale,direction,strength,
                     observed_at,verification_status,verified_at,source,source_url,synced_at,updated_at
                   ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    record.code,
                    leaf_id,
                    "用户表格分类",
                    "中",
                    f"用户提供工作簿分类：{industry}。收录表：{pools}。",
                    "undirected",
                    72,
                    "",
                    "unverified",
                    "",
                    SOURCE,
                    source_ref,
                    timestamp,
                    timestamp,
                ),
            )
            inserted_relations += 1

        summary: dict[str, object] = {
            **workbook_stats,
            "uniqueStocks": len(stocks),
            "classificationPaths": len(exact_path_cache),
            "existingCompanies": existing_companies,
            "insertedCompanies": missing_companies,
            "existingExactRelations": existing_relations,
            "insertedRelations": inserted_relations,
            "createdCategories": created_categories,
            "mode": "dry-run" if dry_run else "committed",
            "databaseIntegrity": db.execute("pragma quick_check").fetchone()[0],
        }
        if dry_run:
            db.rollback()
        else:
            db.commit()
        return summary
    except Exception:
        db.rollback()
        raise


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="将分类股票工作簿增量导入产业链星图")
    parser.add_argument("workbook", type=Path, help="待导入的 xlsx 文件")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/stock-classification.sqlite"),
        help="SQLite 数据库路径",
    )
    parser.add_argument("--dry-run", action="store_true", help="执行完整校验后回滚，不写入数据库")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    workbook = args.workbook.expanduser().resolve()
    database = args.db.expanduser().resolve()
    if not workbook.is_file():
        raise SystemExit(f"工作簿不存在：{workbook}")
    if not database.is_file():
        raise SystemExit(f"数据库不存在：{database}")
    stocks, workbook_stats = read_workbook(workbook)
    with sqlite3.connect(database, isolation_level=None) as db:
        summary = import_records(db, stocks, workbook, args.dry_run, workbook_stats)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, sqlite3.Error) as error:
        print(f"导入失败：{error}", file=sys.stderr)
        raise SystemExit(1) from error
