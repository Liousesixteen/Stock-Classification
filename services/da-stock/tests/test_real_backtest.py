from datetime import date, timedelta
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "real_backtest.py"
SPEC = importlib.util.spec_from_file_location("real_backtest", MODULE_PATH)
real_backtest = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = real_backtest
SPEC.loader.exec_module(real_backtest)
Bar = real_backtest.Bar
run_strategy = real_backtest.run_strategy


def bars(closes):
    start = date(2024, 1, 2)
    return [Bar((start + timedelta(days=i)).isoformat(), value, value * 1.01, value * .99, value, 1000) for i, value in enumerate(closes)]


class RealBacktestTests(unittest.TestCase):
    def request(self, **overrides):
        value = {
            "code": "600519", "start_date": "2024-01-02", "end_date": "2024-03-21",
            "strategy": "ma_cross", "fast_period": 2, "slow_period": 3,
            "initial_capital": 100000, "commission_bps": 0, "slippage_bps": 0, "sell_tax_bps": 0,
        }
        value.update(overrides)
        return value

    def test_signal_executes_on_next_open(self):
        series = bars([10, 10, 11] + [12] * 37 + [9] * 40)
        result = run_strategy(self.request(), series, {"source": "fixture", "asOf": series[-1].date})
        self.assertEqual(result["orders"][0]["side"], "buy")
        self.assertEqual(result["orders"][0]["date"], series[3].date)

    def test_costs_reduce_return(self):
        series = bars([10 + i * .1 for i in range(80)])
        free = run_strategy(self.request(strategy="buy_hold"), series, {"source": "fixture", "asOf": series[-1].date})
        costly = run_strategy(self.request(strategy="buy_hold", commission_bps=10, slippage_bps=10), series, {"source": "fixture", "asOf": series[-1].date})
        self.assertLess(costly["summary"]["totalReturnPct"], free["summary"]["totalReturnPct"])

    def test_drawdown_is_reported(self):
        series = bars([10] * 5 + [12] * 30 + [8] * 45)
        result = run_strategy(self.request(strategy="buy_hold"), series, {"source": "fixture", "asOf": series[-1].date})
        self.assertLess(result["summary"]["maxDrawdownPct"], -30)

    def test_real_bar_cache_round_trip(self):
        series = bars([10 + i * .1 for i in range(40)])
        with tempfile.TemporaryDirectory() as directory:
            database = str(Path(directory) / "stock_analysis.db")
            real_backtest.save_market_cache(database, "sh600519", series)
            loaded, cached_at = real_backtest.load_market_cache(database, "sh600519", series[0].date, series[-1].date)
        self.assertEqual(loaded, series)
        self.assertIsNotNone(cached_at)


if __name__ == "__main__":
    unittest.main()
