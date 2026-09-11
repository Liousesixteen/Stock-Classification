#!/usr/bin/env python3
"""Audit portable stock data-source configuration.

This script is intentionally offline and dependency-free. It checks whether
provider keys/settings are present and prints a redacted readiness summary.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, MutableMapping, Sequence


ENV_LINE_RE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$")


PROVIDERS = [
    {
        "name": "A-share zero-key baseline",
        "kind": "market-data",
        "markets": ["CN"],
        "required_any": [],
        "notes": "Uses efinance/AkShare/Pytdx/Baostock/yfinance where installed by the target app.",
    },
    {
        "name": "Tushare Pro",
        "kind": "market-data",
        "markets": ["CN"],
        "required_any": ["TUSHARE_TOKEN"],
        "notes": "Improves CN history, calendar, and fundamentals when quota/points allow.",
    },
    {
        "name": "TickFlow",
        "kind": "market-review",
        "markets": ["CN"],
        "required_any": ["TICKFLOW_API_KEY"],
        "notes": "Used for A-share market review enhancement.",
    },
    {
        "name": "Longbridge",
        "kind": "market-data",
        "markets": ["HK", "US"],
        "required_any": [
            "LONGBRIDGE_OAUTH_TOKEN_CACHE_B64",
            "LONGBRIDGE_OAUTH_CLIENT_ID",
            "LONGBRIDGE_APP_KEY",
        ],
        "required_all_groups": [
            ["LONGBRIDGE_APP_KEY", "LONGBRIDGE_APP_SECRET", "LONGBRIDGE_ACCESS_TOKEN"],
        ],
        "notes": "OAuth cache or full legacy credential triplet enables richer HK/US data.",
    },
    {
        "name": "Finnhub",
        "kind": "market-data",
        "markets": ["US"],
        "required_any": ["FINNHUB_API_KEY"],
        "notes": "US quote/history fallback.",
    },
    {
        "name": "AlphaVantage",
        "kind": "market-data",
        "markets": ["US", "global"],
        "required_any": ["ALPHAVANTAGE_API_KEY"],
        "notes": "US/global quote/history fallback; free quota is small.",
    },
    {
        "name": "Search providers",
        "kind": "news-search",
        "markets": ["CN", "HK", "US", "global"],
        "required_any": [
            "ANSPIRE_API_KEYS",
            "BOCHA_API_KEYS",
            "TAVILY_API_KEYS",
            "SERPAPI_API_KEYS",
            "BRAVE_API_KEYS",
            "MINIMAX_API_KEYS",
            "SEARXNG_BASE_URLS",
        ],
        "notes": "At least one keyed search provider is recommended for current news.",
    },
    {
        "name": "Social sentiment",
        "kind": "sentiment",
        "markets": ["US"],
        "required_any": ["SOCIAL_SENTIMENT_API_KEY"],
        "notes": "Optional US ticker sentiment provider.",
    },
    {
        "name": "LLM legacy keys",
        "kind": "llm",
        "markets": ["all"],
        "required_any": [
            "ANSPIRE_API_KEYS",
            "AIHUBMIX_KEY",
            "GEMINI_API_KEY",
            "GEMINI_API_KEYS",
            "DEEPSEEK_API_KEY",
            "DEEPSEEK_API_KEYS",
            "ANTHROPIC_API_KEY",
            "ANTHROPIC_API_KEYS",
            "OPENAI_API_KEY",
            "OPENAI_API_KEYS",
        ],
        "notes": "One LLM key is needed for report generation unless the app uses local/YAML/channel config.",
    },
    {
        "name": "LLM channels",
        "kind": "llm",
        "markets": ["all"],
        "required_any": ["LLM_CHANNELS", "LITELLM_CONFIG", "LITELLM_CONFIG_YAML"],
        "notes": "Use for multi-provider routing, fallback, custom base URLs, or LiteLLM YAML.",
    },
    {
        "name": "Vision",
        "kind": "vision",
        "markets": ["all"],
        "required_any": ["VISION_MODEL", "OPENAI_VISION_MODEL"],
        "notes": "Needed only for image/screenshot stock-code extraction.",
    },
    {
        "name": "AlphaSift",
        "kind": "screening",
        "markets": ["CN"],
        "required_any": ["ALPHASIFT_ENABLED"],
        "enabled_values": {"ALPHASIFT_ENABLED": {"1", "true", "yes", "on"}},
        "notes": "Requires the target app to install and wire AlphaSift.",
    },
]


TEMPLATE_KEYS = [
    "STOCK_LIST",
    "TUSHARE_TOKEN",
    "TICKFLOW_API_KEY",
    "FINNHUB_API_KEY",
    "ALPHAVANTAGE_API_KEY",
    "LONGBRIDGE_OAUTH_CLIENT_ID",
    "LONGBRIDGE_OAUTH_TOKEN_CACHE_B64",
    "LONGBRIDGE_APP_KEY",
    "LONGBRIDGE_APP_SECRET",
    "LONGBRIDGE_ACCESS_TOKEN",
    "ANSPIRE_API_KEYS",
    "BOCHA_API_KEYS",
    "TAVILY_API_KEYS",
    "SERPAPI_API_KEYS",
    "BRAVE_API_KEYS",
    "MINIMAX_API_KEYS",
    "SEARXNG_BASE_URLS",
    "SOCIAL_SENTIMENT_API_KEY",
    "LITELLM_MODEL",
    "LLM_CHANNELS",
    "AIHUBMIX_KEY",
    "GEMINI_API_KEY",
    "DEEPSEEK_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "VISION_MODEL",
]


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


def load_config(path: str | None) -> Dict[str, str]:
    config = dict(os.environ)
    if path:
        config.update(parse_env_file(Path(path)))
    return config


def truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def has_value(config: Mapping[str, str], key: str) -> bool:
    return bool((config.get(key) or "").strip())


def provider_enabled(provider: Mapping[str, object], config: Mapping[str, str]) -> bool:
    required_any = list(provider.get("required_any") or [])
    enabled_values = provider.get("enabled_values") or {}
    if not required_any and not provider.get("required_all_groups"):
        return True

    for key in required_any:
        if isinstance(enabled_values, Mapping) and key in enabled_values:
            allowed = {str(v).lower() for v in enabled_values[key]}
            if (config.get(key) or "").strip().lower() in allowed:
                return True
        elif has_value(config, str(key)):
            return True

    for group in provider.get("required_all_groups") or []:
        if all(has_value(config, str(key)) for key in group):
            return True

    return False


def audit(config: Mapping[str, str]) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for provider in PROVIDERS:
        keys = sorted(
            {
                str(key)
                for key in provider.get("required_any", [])
            }
            | {
                str(key)
                for group in provider.get("required_all_groups", [])
                for key in group
            }
        )
        rows.append(
            {
                "name": provider["name"],
                "kind": provider["kind"],
                "markets": provider["markets"],
                "enabled": provider_enabled(provider, config),
                "configured_keys": [key for key in keys if has_value(config, key)],
                "candidate_keys": keys,
                "notes": provider["notes"],
            }
        )
    return rows


def print_text(rows: Sequence[Mapping[str, object]]) -> None:
    enabled = [row for row in rows if row["enabled"]]
    print(f"Enabled provider groups: {len(enabled)}/{len(rows)}")
    for row in rows:
        status = "OK" if row["enabled"] else "missing"
        configured = ", ".join(row["configured_keys"]) or "-"
        candidates = ", ".join(row["candidate_keys"]) or "no key required"
        print(f"\n[{status}] {row['name']} ({row['kind']})")
        print(f"  markets: {', '.join(row['markets'])}")
        print(f"  configured: {configured}")
        print(f"  accepts: {candidates}")
        print(f"  note: {row['notes']}")


def print_template() -> None:
    for key in TEMPLATE_KEYS:
        default = "600519,300750,hk00700,AAPL" if key == "STOCK_LIST" else ""
        print(f"{key}={default}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", help="Path to a .env file. Defaults to current process environment.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    parser.add_argument("--template", action="store_true", help="Print a minimal .env template and exit.")
    args = parser.parse_args(argv)

    if args.template:
        print_template()
        return 0

    config = load_config(args.env)
    rows = audit(config)
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        print_text(rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
