# Vendored DA-Stock chat engine

Source revision: `12a7e6d3c76b8b70ee0a7ac4e541e1edf26637b2` from Liousesixteen/DA-Stock (local checkout).
`upstream/src`, `data_provider`, `strategies`, `templates`, `data-sources`,
the companion `stock-data-enhanced` provider package, requirements and example
configuration are copied intact; their license files are retained.
These include the original factory, ReAct runner, multi-agent orchestrator, LLM routing/fallback, tool registry, provider fallback, search, context compression and storage.
No original credentials, data, history, virtual environment or running HTTP service are imported.

The private bridge calls `build_agent_executor(...).chat(...)`. It forwards actual execution events and the original answer without JSON report reformatting. Next owns the public API and existing conversation UI.

Runtime: local `.venv/bin/python` or `DA_STOCK_PYTHON`; otherwise Docker image `stock-classification-research:local` (`DA_STOCK_IMAGE` override). Build with `docker build -t stock-classification-research:local services/da-stock`.
Docker runs on demand, publishes no port and mounts only this vendored engine and `data/da-stock`. Cancelling a request stops its container.
Existing DeepSeek variables are translated to the original OpenAI-compatible channel without changing their stored values. Other original model/data-source settings can be supplied using the names in `upstream/.env.example`; unset providers are not advertised as verified.

## Backtest workspace

The original DA-Stock backtest engine, service, repositories, schemas and provider fallbacks are retained in `upstream/`. `backtest_bridge.py` exposes its run, result and performance operations to the main Next application without starting the original web server. The migrated workspace preserves stock/date/phase filtering, 1–120 day evaluation windows, next-day validation, forced reruns, paginated evaluations, and overall/per-stock metrics.

Runtime data lives at `data/da-stock/stock_analysis.db` by default and can be overridden with `DA_STOCK_BACKTEST_DB`. Install the project-local Python runtime with `npm run backtest:setup`; normal application startup then serves the backtest from the Market Workbench without port 18000.

The bridge and integrated UI are covered by the main project's type, route and browser checks. Live backtest output still depends on the selected stock having an analysis record and on its market-data provider being reachable; missing data remains explicit rather than being fabricated.
