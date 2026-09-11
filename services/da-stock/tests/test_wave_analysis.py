from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
import sys
import unittest


SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from real_backtest import Bar  # noqa: E402
from wave_analysis import _candidate_window, _impulse_rules, _levels, _zigzag  # noqa: E402


def points(prices: list[float], first_kind: str = "low"):
    items = []
    current = first_kind
    for index, price in enumerate(prices):
        items.append({"index": index, "date": f"2025-01-{index + 1:02d}", "price": price, "kind": current})
        current = "high" if current == "low" else "low"
    return items


class WaveAnalysisTest(unittest.TestCase):
    def test_impulse_rules_accept_valid_bullish_structure(self):
        result = _impulse_rules(points([100, 110, 105, 125, 112, 130]), bullish=True)
        self.assertEqual([item["passed"] for item in result], [True, True, True])

    def test_wave_four_overlap_invalidates_structure(self):
        result = _impulse_rules(points([100, 110, 105, 125, 108, 130]), bullish=True)
        self.assertFalse(result[2]["passed"])

    def test_candidate_window_prefers_rule_valid_impulse(self):
        source = points([90, 98, 92, 105, 96, 109, 100, 110, 105, 125, 112, 130, 119, 127])
        candidate, bullish = _candidate_window(source)
        self.assertTrue(bullish)
        self.assertGreaterEqual(len(candidate), 6)
        self.assertTrue(all(rule["passed"] for rule in _impulse_rules(candidate, bullish)))

    def test_zigzag_and_fibonacci_levels_are_data_driven(self):
        start = date(2025, 1, 1)
        closes = [100, 102, 106, 110, 108, 104, 105, 112, 118, 116, 109, 112, 121]
        bars = [Bar((start + timedelta(days=index)).isoformat(), value, value, value, value) for index, value in enumerate(closes)]
        pivots = _zigzag(bars, 5)
        self.assertGreaterEqual(len(pivots), 4)
        levels = _levels(pivots, pivots[0]["kind"] == "low")
        self.assertGreaterEqual(len(levels), 2)
        self.assertTrue(all(level["price"] > 0 for level in levels))


if __name__ == "__main__":
    unittest.main()
