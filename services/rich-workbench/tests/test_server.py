import gzip
import importlib.util
import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("rich_server", ROOT / "server.py")
server = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = server
SPEC.loader.exec_module(server)


class CoreTests(unittest.TestCase):
    def test_finite_accepts_number(self): self.assertEqual(server.finite("1.25"), 1.25)
    def test_finite_rejects_nan(self): self.assertIsNone(server.finite("nan"))
    def test_finite_rejects_infinity(self): self.assertIsNone(server.finite(float("inf")))
    def test_market_closed_on_weekend(self):
        self.assertFalse(server.market_open(datetime(2026, 8, 23, 10, 0, tzinfo=timezone(timedelta(hours=8)))))
    def test_market_open_during_morning(self):
        self.assertTrue(server.market_open(datetime(2026, 8, 21, 10, 0, tzinfo=timezone(timedelta(hours=8)))))
    def test_market_closed_at_lunch(self):
        self.assertFalse(server.market_open(datetime(2026, 8, 21, 12, 0, tzinfo=timezone(timedelta(hours=8)))))

    def test_indicators_reject_short_series(self):
        self.assertEqual(server.indicators([{"close": i} for i in range(20)])["status"], "insufficient")

    def test_indicators_are_finite(self):
        result = server.indicators([{"close": 100 + i * .2 + (i % 3)} for i in range(80)])
        self.assertEqual(result["status"], "ok")
        self.assertIsNotNone(server.finite(result["rsi14"]))
        self.assertIsInstance(result["above_ma60"], bool)
        self.assertIsNotNone(server.finite(result["ma60_extension_pct"]))
        self.assertIsNotNone(server.finite(result["volatility_percentile"]))

    def test_portfolio_contract_has_two_confirmed_items(self):
        data = json.loads((ROOT / "private" / "portfolio.json").read_text())
        self.assertEqual(len(data["持仓"]), 2)
        self.assertTrue(all(x["identity_verified"] and x["amount_verified"] for x in data["持仓"]))
        self.assertTrue(all(not x["decision_eligible"] for x in data["持仓"]))

    def test_private_data_is_ignored(self):
        ignore = (ROOT / ".gitignore").read_text()
        self.assertIn("private/", ignore)
        self.assertIn(".dash_state.json", ignore)

    def test_config_enables_lookthrough_mode(self):
        cfg = json.loads((ROOT / "config.json").read_text())
        self.assertEqual(cfg["持仓模式"], "fund_lookthrough")
        self.assertTrue(cfg["访问控制"]["启用"])

    def test_stock_is_default_without_fake_holdings(self):
        cfg = json.loads((ROOT / "config.json").read_text())
        self.assertEqual(cfg["默认视图"], "stock")
        self.assertEqual([x["tencent"] for x in cfg["股票观察列表"]], ["sh600206", "sh600460", "sh603823"])
        self.assertTrue(all(x["holding"] is False for x in cfg["股票观察列表"]))

    def test_stock_code_normalization(self):
        self.assertEqual(server.normalize_stock_code("600519"), "sh600519")
        self.assertEqual(server.normalize_stock_code("SZ-300750"), "sz300750")
        self.assertEqual(server.normalize_stock_code("920001"), "bj920001")
        with self.assertRaises(ValueError): server.normalize_stock_code("399006")

    def test_manual_watchlist_is_private_and_deduplicated(self):
        with tempfile.TemporaryDirectory() as temp:
            old_path, old_quotes = server.WATCHLIST_PATH, server.tencent_quotes
            server.WATCHLIST_PATH = Path(temp) / "watchlist.json"
            server.tencent_quotes = lambda codes: {"items": [{"code": codes[0], "name": "贵州茅台"}]}
            try:
                item = server.add_watch_stock("600519")
                self.assertEqual(item["tencent"], "sh600519")
                self.assertTrue(item["user_managed"])
                self.assertIn("sh600519", {x["tencent"] for x in server.stock_watchlist()})
                with self.assertRaises(ValueError): server.add_watch_stock("600519")
                server.remove_watch_stock("sh600519")
                self.assertNotIn("sh600519", {x["tencent"] for x in server.stock_watchlist()})
            finally:
                server.WATCHLIST_PATH, server.tencent_quotes = old_path, old_quotes

    def test_overview_config_contains_only_broad_indices(self):
        cfg = json.loads((ROOT / "config.json").read_text())
        combined = cfg["宽基指数"] + cfg["全球大盘指数"]
        self.assertTrue(all(x["group"] in {"broad", "global"} for x in combined))
        self.assertTrue(all("ETF" not in x["name"].upper() for x in combined))
        self.assertIn("sh000852", {x.get("tencent") for x in combined})
        self.assertNotIn("usINX", {x.get("tencent") for x in combined})
        regions = {x.get("region") for x in cfg["全球大盘指数"]}
        self.assertTrue({"日本", "韩国", "欧洲"}.issubset(regions))

    def test_bull_top_requires_coverage_before_publishing_score(self):
        old_config = server.config
        server.config = lambda: {"见顶信号": {"维度权重": {"估值": 30, "情绪换手": 20, "技术动能": 20, "宽度结构": 20, "波动率": 10}}, "系统顶部观察指数": ["sh000300", "sz399006", "sh000905"]}
        try:
            result = server.bull_top_package(
                {"items": [{"percentile": 80}, {"percentile": 70}, {"percentile": 60}]},
                {"items": []}, {"items": []}, {"items": []},
            )
            self.assertIsNone(result["score"])
            self.assertEqual(result["partial_score"], 70.0)
            self.assertEqual(result["level"], "数据不足")
        finally:
            server.config = old_config

    def test_minute_flow_uses_latest_cumulative_snapshot(self):
        rows = server.parse_stock_flow_lines([
            "2026-08-21 09:31,100,20,-30,70,30",
            "2026-08-21 09:32,150,40,-20,90,60",
        ])
        self.assertEqual(rows[-1]["main_net_yuan"], 150)
        self.assertNotEqual(sum(x["main_net_yuan"] for x in rows), rows[-1]["main_net_yuan"])


class CacheTests(unittest.TestCase):
    def test_cache_hits_builder_once(self):
        cache = server.SWRCache(); count = {"n": 0}
        def build(): count["n"] += 1; return {"ok": True}
        cache.get("a", 60, build); cache.get("a", 60, build)
        self.assertEqual(count["n"], 1)

    def test_single_flight(self):
        cache = server.SWRCache(); count = {"n": 0}; results = []
        def build(): count["n"] += 1; time.sleep(.05); return 7
        threads = [threading.Thread(target=lambda: results.append(cache.get("x", 60, build)[0])) for _ in range(8)]
        [t.start() for t in threads]; [t.join() for t in threads]
        self.assertEqual(count["n"], 1); self.assertEqual(results, [7] * 8)

    def test_failed_refresh_keeps_last_good(self):
        cache = server.SWRCache(); cache.get("x", 0, lambda: {"v": 1})
        time.sleep(.01); value, _ = cache.get("x", 0, lambda: (_ for _ in ()).throw(RuntimeError("boom")))
        self.assertEqual(value["v"], 1)


class StateTests(unittest.TestCase):
    def test_atomic_json_roundtrip(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "x.json"; server.atomic_json(path, {"x": 1})
            self.assertEqual(json.loads(path.read_text()), {"x": 1})

    def test_valuation_flip_is_deduplicated_by_state(self):
        with tempfile.TemporaryDirectory() as temp:
            old = server.STATE_PATH; server.STATE_PATH = Path(temp) / "state.json"
            try:
                server.update_state({"valuations": {"items": [{"code": "A", "level": "适中"}]}})
                server.update_state({"valuations": {"items": [{"code": "A", "level": "高估", "asof": "2026-08-21", "source": "test"}]}})
                state = json.loads(server.STATE_PATH.read_text())
                self.assertEqual(len(state["events"]), 1)
            finally: server.STATE_PATH = old


class FrontendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.html = (ROOT / "web" / "index.html").read_text()
    def test_all_twelve_sections_exist(self):
        for section in ["overview","sector","flow","trend","hold","ind","signal","val","top","condition","detail","news"]:
            self.assertIn(f'id="sec-{section}"', self.html)
    def test_frost_tokens(self):
        for token in ["#00e0ff", "#ff5c6b", "#22D3EE", "#ff8f5c", "#7c5cff", "--rail:200px"]:
            self.assertIn(token, self.html)
    def test_mobile_breakpoints(self):
        self.assertIn("@media(max-width:1100px)", self.html)
        self.assertIn("@media(max-width:420px)", self.html)
    def test_api_not_cached_by_service_worker(self):
        sw = (ROOT / "web" / "sw.js").read_text()
        self.assertIn("url.pathname.startsWith('/rich-workbench/api/')", sw)
    def test_integrated_same_origin_paths(self):
        for token in ['/rich-workbench/api/all', '/rich-workbench/manifest.json', '/rich-workbench/sw.js', '/rich-workbench/integrated.css']:
            self.assertIn(token, self.html)
    def test_integrated_stylesheet_has_browser_safe_mime_type(self):
        source = (ROOT / "server.py").read_text()
        self.assertIn('".css": "text/css; charset=utf-8"', source)
    def test_chart_has_required_layers(self):
        for token in ["MA5", "MA10", "MA20", "MA60", "MACD", "addEventListener('mousemove'", "touchmove"]:
            self.assertIn(token, self.html)
    def test_stock_fund_mode_switch_and_real_flow_ui(self):
        for token in ['data-mode="stock"', 'data-mode="fund"', 'renderFlows()', '逐单资金流', '不跨分钟求和']:
            self.assertIn(token, self.html)
    def test_manual_watchlist_controls_exist(self):
        for token in ['id="watchAddForm"', '/api/watchlist', '校验并添加', 'watch-remove', '手动添加']:
            self.assertIn(token, self.html)
    def test_overview_filters_stocks_and_etfs(self):
        self.assertIn("m.overview_items", self.html)
        self.assertIn("x.group==='broad'||x.group==='global'", self.html)
        self.assertIn("个股、行业ETF和主题ETF已从总览剔除", self.html)
    def test_bull_top_shows_coverage_confidence(self):
        for token in ["覆盖权重", "置信度", "暂不评分", "d.method"]:
            self.assertIn(token, self.html)


class ProxyTrustTests(unittest.TestCase):
    def test_forwarded_request_requires_explicit_loopback_proxy_trust(self):
        handler = type("HandlerStub", (), {
            "headers": {"X-Forwarded-For": "127.0.0.1"},
            "client_address": ("127.0.0.1", 1234),
        })()
        old = os.environ.get("RICH_TRUST_LOOPBACK_PROXY")
        try:
            os.environ.pop("RICH_TRUST_LOOPBACK_PROXY", None)
            self.assertFalse(server.is_loopback(handler))
            os.environ["RICH_TRUST_LOOPBACK_PROXY"] = "true"
            self.assertTrue(server.is_loopback(handler))
        finally:
            if old is None: os.environ.pop("RICH_TRUST_LOOPBACK_PROXY", None)
            else: os.environ["RICH_TRUST_LOOPBACK_PROXY"] = old


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture = {
            "version": "test", "built_at": server.now_iso(), "market_state": "休市",
            "market": {"status": "ok", "items": []}, "sectors": {"status": "ok", "items": []},
            "portfolio": {"holdings": [], "coverage": {}}, "signals": {"items": []},
            "valuations": {"items": []}, "bull_top": {"level": "数据不足", "dimensions": []},
            "news": {"items": []}, "risk_notice": "test", "test_padding": "x" * 1000
        }
        server.CACHE = server.SWRCache()
        server.CACHE._values["all:private"] = server.CacheEntry(fixture, time.time(), 300)
        server.CACHE._values["sectors"] = server.CacheEntry({"status": "ok", "items": []}, time.time(), 300)
        server.CACHE._values["fund_flows"] = server.CacheEntry({"status": "ok", "stocks": [], "sector_inflow": [], "sector_outflow": []}, time.time(), 300)
        server.LAST_PACKAGE = {"built_at": time.time(), "ok": True, "error": None}
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True); cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.httpd.server_port}"

    @classmethod
    def tearDownClass(cls): cls.httpd.shutdown(); cls.httpd.server_close(); cls.thread.join()

    def get(self, path, headers=None):
        req = urllib.request.Request(self.base + path, headers=headers or {})
        with urllib.request.urlopen(req, timeout=3) as res: return res.status, dict(res.headers), res.read()

    def post(self, path, payload):
        req = urllib.request.Request(self.base + path, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=3) as res: return res.status, json.loads(res.read())

    def test_health(self):
        status, _, body = self.get("/api/health"); self.assertEqual(status, 200); self.assertTrue(json.loads(body)["alive"])
    def test_ready(self):
        status, _, body = self.get("/api/ready"); self.assertEqual(status, 200); self.assertTrue(json.loads(body)["ready"])
    def test_all_endpoint(self):
        status, _, body = self.get("/api/all"); self.assertEqual(status, 200); self.assertEqual(json.loads(body)["version"], "test")
    def test_forwarded_request_requires_auth(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.get("/api/all", {"X-Forwarded-For": "203.0.113.8"})
        self.assertEqual(ctx.exception.code, 401)
    def test_gzip_api(self):
        status, headers, body = self.get("/api/all", {"Accept-Encoding": "gzip"})
        self.assertEqual(status, 200); self.assertEqual(headers.get("Content-Encoding"), "gzip")
        self.assertEqual(json.loads(gzip.decompress(body))["version"], "test")
    def test_fund_flow_endpoint(self):
        status, _, body = self.get("/api/fund-flow")
        self.assertEqual(status, 200); self.assertEqual(json.loads(body)["status"], "ok")
    def test_watchlist_post_endpoint(self):
        old_add, old_list = server.add_watch_stock, server.stock_watchlist
        item = {"name": "贵州茅台", "tencent": "sh600519", "group": "stock", "user_managed": True}
        server.add_watch_stock = lambda code: item
        server.stock_watchlist = lambda: [item]
        try:
            status, body = self.post("/api/watchlist", {"action": "add", "code": "600519"})
            self.assertEqual(status, 200); self.assertEqual(body["item"]["tencent"], "sh600519")
        finally:
            server.add_watch_stock, server.stock_watchlist = old_add, old_list
    def test_index_has_etag(self):
        status, headers, body = self.get("/"); self.assertEqual(status, 200); self.assertIn("ETag", headers); self.assertIn(b"Yidianx", body)
    def test_path_traversal_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx: self.get("/%2e%2e/server.py")
        self.assertEqual(ctx.exception.code, 404)


if __name__ == "__main__": unittest.main(verbosity=2)
