"""NDJSON adapter for DA-Stock's original backtest service."""
from __future__ import annotations

from datetime import date
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent / "upstream"
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)


def parsed_date(value):
    return date.fromisoformat(value) if value else None


def main():
    request = json.loads(sys.stdin.readline())
    for name, value in request.pop("environment", {}).items():
        os.environ[name] = str(value)
    operation = request.pop("operation")
    if operation in {"strategy", "wave"}:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        if operation == "strategy":
            from real_backtest import execute
        else:
            from wave_analysis import execute
        payload = execute(request, os.environ.get("DATABASE_PATH", ""))
    else:
        from src.services.backtest_service import BacktestService
        from src.storage import DatabaseManager
        service = BacktestService(DatabaseManager.get_instance())
        if operation == "run":
            payload = service.run_backtest(
                code=request.get("code"), force=bool(request.get("force", False)),
                eval_window_days=request.get("eval_window_days"),
                min_age_days=request.get("min_age_days"), limit=int(request.get("limit", 200)),
            )
        elif operation == "results":
            payload = service.get_recent_evaluations(
                code=request.get("code"), eval_window_days=request.get("eval_window_days"),
                analysis_date_from=parsed_date(request.get("analysis_date_from")),
                analysis_date_to=parsed_date(request.get("analysis_date_to")),
                analysis_phase=request.get("analysis_phase"),
                page=int(request.get("page", 1)), limit=int(request.get("limit", 20)),
            )
        elif operation == "performance":
            scope = "stock" if request.get("code") else "overall"
            payload = service.get_summary(
                scope=scope, code=request.get("code"), eval_window_days=request.get("eval_window_days"),
                analysis_date_from=parsed_date(request.get("analysis_date_from")),
                analysis_date_to=parsed_date(request.get("analysis_date_to")),
                analysis_phase=request.get("analysis_phase"),
            )
        else:
            raise ValueError("unsupported operation")
    sys.stdout.write(json.dumps({"ok": True, "data": payload}, ensure_ascii=False, default=str) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        sys.stdout.write(json.dumps({"ok": False, "error": str(exc), "type": type(exc).__name__}, ensure_ascii=False) + "\n")
        sys.exit(1)
