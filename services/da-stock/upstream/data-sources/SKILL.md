---
name: data-sources
description: Use when configuring stock market data providers, API keys, fallback order, news/search sources, social sentiment, LLM/Vision providers, or troubleshooting auth, quota, rate-limit, timeout, stale data, and no-data issues for A-share, Hong Kong, or US stock analysis systems.
---

# Data Sources

This is a portable stock-data-source skill. It does not require any specific repository or codebase. Use it to help a user or another agent configure market data, news/search, social sentiment, and LLM/Vision providers for stock analysis tools such as OpenClaw, custom agents, scripts, dashboards, or workflow runners.

## Install Or Share

This skill is the `data-sources/` folder containing this `SKILL.md` file. To give it to another user or another computer, copy the whole folder as-is.

Recommended installation patterns:

1. If the target agent supports a user-level skills directory, place it there as `data-sources/SKILL.md`.
2. If the target agent supports project-level skills only, place it inside that target project as `data-sources/SKILL.md` or under the agent's documented project-skill directory.
3. If the target agent does not auto-discover skills, give the agent the absolute path to this `SKILL.md` and use the handoff prompt at the end of this file.
4. Do not bundle `.env` files, API keys, OAuth tokens, cookies, or screenshots containing secrets with the skill.
5. Keep app-specific adapters outside this skill. This skill defines portable provider guidance and canonical configuration names; the receiving agent maps them to its own app or workflow.

## Bundled Script

Use `scripts/check_config.py` when the receiving agent needs an offline readiness check. It has no third-party dependencies and never calls live provider APIs.

```bash
python3 scripts/check_config.py --env /path/to/.env
python3 scripts/check_config.py --env /path/to/.env --json
python3 scripts/check_config.py --template
```

The script reports which provider groups are configured, which keys were detected, and which keys each group accepts. It redacts values by never printing them.

## Core Principle

Treat every provider as optional. Build a working baseline with free/no-key sources, then add API-key providers for stability, coverage, freshness, and quotas. Never let one provider failure break the whole analysis unless the user explicitly asks for fail-fast behavior.

## How To Use

1. Ask what markets the user needs: A-share/CN, Hong Kong, US, or mixed.
2. Ask what capabilities are needed: daily K-line, realtime quotes, fundamentals, market review, news, social sentiment, LLM analysis, image/Vision extraction.
3. Pick a provider profile from the table below.
4. Create or update the app's `.env`, secrets manager, or OpenClaw/provider settings using the canonical env names in this skill.
5. If the target app uses different variable names, map these canonical names to that app's config schema.
6. Validate one provider at a time. Do not paste real API keys into chat, logs, commits, screenshots, or issue bodies.

## Recommended Profiles

| Profile | Best for | Configure |
| --- | --- | --- |
| Zero-key baseline | Local trial, no paid APIs | `efinance`, `akshare`, `pytdx`, `baostock`, `yfinance`, optional public `SearXNG` |
| A-share stable | CN stocks, better historical/fundamental coverage | `TUSHARE_TOKEN` plus zero-key fallbacks |
| HK/US stable | HK/US quotes and richer realtime fields | `LONGBRIDGE_*`, plus `FINNHUB_API_KEY` and/or `ALPHAVANTAGE_API_KEY` for US fallback |
| News-enabled | Stock news, market intelligence | one of `ANSPIRE_API_KEYS`, `BOCHA_API_KEYS`, `TAVILY_API_KEYS`, `SERPAPI_API_KEYS`, `BRAVE_API_KEYS`, `MINIMAX_API_KEYS`, or `SEARXNG_BASE_URLS` |
| Full agent analysis | Reports, research, image recognition, strategy agents | market data profile + news profile + one LLM provider such as `ANSPIRE_API_KEYS`, `AIHUBMIX_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `LLM_CHANNELS` |

## Minimal Env Template

Use this as a portable starting point. Delete providers the user does not use.

```bash
# Watchlist
STOCK_LIST=600519,300750,hk00700,AAPL

# Market data: A-share / CN
TUSHARE_TOKEN=
TUSHARE_RATE_LIMIT_PER_MINUTE=80
AKSHARE_SLEEP_MIN=2
AKSHARE_SLEEP_MAX=5
STOCK_INDEX_REMOTE_UPDATE_ENABLED=true
EFINANCE_PRIORITY=0
EFINANCE_CALL_TIMEOUT=30
AKSHARE_PRIORITY=1
TUSHARE_PRIORITY=2
PYTDX_PRIORITY=2
PYTDX_HOST=
PYTDX_PORT=
PYTDX_SERVERS=
BAOSTOCK_PRIORITY=3
YFINANCE_PRIORITY=4

# Market data: HK / US
LONGBRIDGE_OAUTH_CLIENT_ID=
LONGBRIDGE_OAUTH_TOKEN_CACHE_B64=
LONGBRIDGE_APP_KEY=
LONGBRIDGE_APP_SECRET=
LONGBRIDGE_ACCESS_TOKEN=
LONGBRIDGE_REGION=hk
LONGPORT_REGION=
LONGBRIDGE_PRIORITY=5
LONGBRIDGE_STATIC_INFO_TTL_SECONDS=86400
LONGBRIDGE_CONNECTION_COOLDOWN_SECONDS=15
LONGBRIDGE_HTTP_URL=
LONGBRIDGE_QUOTE_WS_URL=
LONGBRIDGE_TRADE_WS_URL=
LONGBRIDGE_ENABLE_OVERNIGHT=false
LONGBRIDGE_PUSH_CANDLESTICK_MODE=realtime
LONGBRIDGE_PRINT_QUOTE_PACKAGES=false
FINNHUB_API_KEY=
ALPHAVANTAGE_API_KEY=

# Realtime and stability
ENABLE_REALTIME_QUOTE=true
ENABLE_REALTIME_TECHNICAL_INDICATORS=true
REALTIME_SOURCE_PRIORITY=tencent,akshare_sina,efinance,akshare_em,tushare,longbridge,yfinance,finnhub,alphavantage
REALTIME_CACHE_TTL=600
CIRCUIT_BREAKER_COOLDOWN=300
PREFETCH_REALTIME_QUOTES=true
ENABLE_CHIP_DISTRIBUTION=true
ENABLE_EASTMONEY_PATCH=false
MAX_WORKERS=3
HTTP_PROXY=
HTTPS_PROXY=
NO_PROXY=eastmoney.com,sina.com.cn,tushare.pro,baostock.com,sse.com.cn,szse.cn,localhost,127.0.0.1

# Fundamentals
ENABLE_FUNDAMENTAL_PIPELINE=true
FUNDAMENTAL_STAGE_TIMEOUT_SECONDS=8
FUNDAMENTAL_FETCH_TIMEOUT_SECONDS=3
FUNDAMENTAL_RETRY_MAX=1
FUNDAMENTAL_CACHE_TTL_SECONDS=120
FUNDAMENTAL_CACHE_MAX_ENTRIES=256

# Stock screening / candidate discovery
ALPHASIFT_ENABLED=false
ALPHASIFT_INSTALL_SPEC=
SNAPSHOT_SOURCE_PRIORITY=em_datacenter,tushare,efinance,akshare_em
LLM_TIMEOUT_SEC=60

# News/search
ANSPIRE_API_KEYS=
BOCHA_API_KEYS=
TAVILY_API_KEYS=
SERPAPI_API_KEYS=
BRAVE_API_KEYS=
MINIMAX_API_KEYS=
SEARXNG_BASE_URLS=
SEARXNG_PUBLIC_INSTANCES_ENABLED=true
NEWS_STRATEGY_PROFILE=short
NEWS_MAX_AGE_DAYS=3
BIAS_THRESHOLD=5.0

# US social sentiment
SOCIAL_SENTIMENT_API_KEY=
SOCIAL_SENTIMENT_API_URL=https://api.adanos.org

# LLM / Vision
LITELLM_CONFIG=
LITELLM_CONFIG_YAML=
LITELLM_API_KEY=
LITELLM_MODEL=
AGENT_LITELLM_MODEL=
LITELLM_FALLBACK_MODELS=
LLM_CHANNELS=
LLM_TEMPERATURE=0.7
VISION_MODEL=
OPENAI_VISION_MODEL=
VISION_PROVIDER_PRIORITY=gemini,anthropic,openai
ANSPIRE_LLM_ENABLED=true
ANSPIRE_LLM_MODEL=
ANSPIRE_LLM_BASE_URL=
AIHUBMIX_KEY=
GEMINI_API_KEY=
GEMINI_API_KEYS=
GEMINI_MODEL=
GEMINI_MODEL_FALLBACK=
GEMINI_TEMPERATURE=0.7
GEMINI_REQUEST_DELAY=2.0
GEMINI_MAX_RETRIES=5
GEMINI_RETRY_DELAY=5.0
DEEPSEEK_API_KEY=
DEEPSEEK_API_KEYS=
ANTHROPIC_API_KEY=
ANTHROPIC_API_KEYS=
ANTHROPIC_MODEL=
ANTHROPIC_TEMPERATURE=0.7
ANTHROPIC_MAX_TOKENS=8192
OPENAI_API_KEY=
OPENAI_API_KEYS=
OPENAI_BASE_URL=
OPENAI_MODEL=
OPENAI_TEMPERATURE=0.7
OLLAMA_API_BASE=
```

## Original Project Key Inventory

The keys below mirror the source project's data-source, search, LLM, Vision, and provider-stability configuration surface. Use this section as the exhaustive lookup; use the minimal template above for first-run setup.

| Area | Keys |
| --- | --- |
| Watchlist | `STOCK_LIST` |
| A-share keyed providers | `TUSHARE_TOKEN`, `TICKFLOW_API_KEY` |
| A-share no-key provider priority | `EFINANCE_PRIORITY`, `EFINANCE_CALL_TIMEOUT`, `AKSHARE_PRIORITY`, `TUSHARE_PRIORITY`, `PYTDX_PRIORITY`, `PYTDX_HOST`, `PYTDX_PORT`, `PYTDX_SERVERS`, `BAOSTOCK_PRIORITY`, `YFINANCE_PRIORITY` |
| HK/US keyed providers | `LONGBRIDGE_OAUTH_CLIENT_ID`, `LONGBRIDGE_OAUTH_TOKEN_CACHE_B64`, `LONGBRIDGE_APP_KEY`, `LONGBRIDGE_APP_SECRET`, `LONGBRIDGE_ACCESS_TOKEN`, `FINNHUB_API_KEY`, `ALPHAVANTAGE_API_KEY` |
| Longbridge runtime | `LONGBRIDGE_REGION`, `LONGPORT_REGION`, `LONGBRIDGE_PRIORITY`, `LONGBRIDGE_STATIC_INFO_TTL_SECONDS`, `LONGBRIDGE_CONNECTION_COOLDOWN_SECONDS`, `LONGBRIDGE_HTTP_URL`, `LONGBRIDGE_QUOTE_WS_URL`, `LONGBRIDGE_TRADE_WS_URL`, `LONGBRIDGE_ENABLE_OVERNIGHT`, `LONGBRIDGE_PUSH_CANDLESTICK_MODE`, `LONGBRIDGE_PRINT_QUOTE_PACKAGES` |
| Realtime/stability | `ENABLE_REALTIME_QUOTE`, `ENABLE_REALTIME_TECHNICAL_INDICATORS`, `REALTIME_SOURCE_PRIORITY`, `REALTIME_CACHE_TTL`, `CIRCUIT_BREAKER_COOLDOWN`, `PREFETCH_REALTIME_QUOTES`, `ENABLE_CHIP_DISTRIBUTION`, `ENABLE_EASTMONEY_PATCH`, `MAX_WORKERS`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` |
| Fundamentals | `ENABLE_FUNDAMENTAL_PIPELINE`, `FUNDAMENTAL_STAGE_TIMEOUT_SECONDS`, `FUNDAMENTAL_FETCH_TIMEOUT_SECONDS`, `FUNDAMENTAL_RETRY_MAX`, `FUNDAMENTAL_CACHE_TTL_SECONDS`, `FUNDAMENTAL_CACHE_MAX_ENTRIES` |
| Stock index | `STOCK_INDEX_REMOTE_UPDATE_ENABLED` |
| Market review | `MARKET_REVIEW_ENABLED`, `MARKET_REVIEW_REGION`, `MARKET_REVIEW_COLOR_SCHEME`, `TRADING_DAY_CHECK_ENABLED` |
| AlphaSift screening | `ALPHASIFT_ENABLED`, `ALPHASIFT_INSTALL_SPEC`, `SNAPSHOT_SOURCE_PRIORITY`, `LLM_TIMEOUT_SEC` |
| News/search | `ANSPIRE_API_KEYS`, `BOCHA_API_KEYS`, `TAVILY_API_KEYS`, `SERPAPI_API_KEYS`, `BRAVE_API_KEYS`, `MINIMAX_API_KEYS`, `SEARXNG_BASE_URLS`, `SEARXNG_PUBLIC_INSTANCES_ENABLED`, `NEWS_STRATEGY_PROFILE`, `NEWS_MAX_AGE_DAYS`, `BIAS_THRESHOLD` |
| Social sentiment | `SOCIAL_SENTIMENT_API_KEY`, `SOCIAL_SENTIMENT_API_URL` |
| LiteLLM core | `LITELLM_CONFIG`, `LITELLM_CONFIG_YAML`, `LITELLM_API_KEY`, `LITELLM_MODEL`, `AGENT_LITELLM_MODEL`, `LITELLM_FALLBACK_MODELS`, `LLM_CHANNELS`, `LLM_TEMPERATURE`, `LITELLM_LOG_LEVEL` |
| Legacy LLM keys | `ANSPIRE_LLM_ENABLED`, `ANSPIRE_LLM_MODEL`, `ANSPIRE_LLM_BASE_URL`, `AIHUBMIX_KEY`, `GEMINI_API_KEY`, `GEMINI_API_KEYS`, `GEMINI_MODEL`, `GEMINI_MODEL_FALLBACK`, `GEMINI_TEMPERATURE`, `GEMINI_REQUEST_DELAY`, `GEMINI_MAX_RETRIES`, `GEMINI_RETRY_DELAY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_API_KEYS`, `ANTHROPIC_API_KEY`, `ANTHROPIC_API_KEYS`, `ANTHROPIC_MODEL`, `ANTHROPIC_TEMPERATURE`, `ANTHROPIC_MAX_TOKENS`, `OPENAI_API_KEY`, `OPENAI_API_KEYS`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_TEMPERATURE`, `OLLAMA_API_BASE` |
| Vision | `VISION_MODEL`, `OPENAI_VISION_MODEL`, `VISION_PROVIDER_PRIORITY` |
| Generic channel pattern | `LLM_<CHANNEL>_PROTOCOL`, `LLM_<CHANNEL>_BASE_URL`, `LLM_<CHANNEL>_API_KEY`, `LLM_<CHANNEL>_API_KEYS`, `LLM_<CHANNEL>_MODELS`, `LLM_<CHANNEL>_ENABLED`, `LLM_<CHANNEL>_EXTRA_HEADERS` |
| Built-in channel prefixes | `LLM_ANSPIRE_*`, `LLM_AIHUBMIX_*`, `LLM_OPENAI_*`, `LLM_DEEPSEEK_*`, `LLM_GEMINI_*`, `LLM_ANTHROPIC_*`, `LLM_MOONSHOT_*`, `LLM_DASHSCOPE_*`, `LLM_ZHIPU_*`, `LLM_MINIMAX_*`, `LLM_MIMO_*`, `LLM_VOLCENGINE_*`, `LLM_SILICONFLOW_*`, `LLM_OPENROUTER_*`, `LLM_OLLAMA_*` |
| Portfolio data helpers | `PORTFOLIO_FX_UPDATE_ENABLED` |

## Non-Data-Source Keys From The Original Project

These original-project keys are intentionally not part of provider selection or market/news/LLM data acquisition. Mention them only if the user also asks to configure delivery channels, bots, reports, storage, scheduling, Web UI, or backtesting.

| Area | Keys |
| --- | --- |
| WeChat/WeCom delivery | `WECHAT_WEBHOOK_URL`, `WECHAT_MSG_TYPE`, `WECHAT_MAX_BYTES`, `WECOM_CORPID`, `WECOM_TOKEN`, `WECOM_ENCODING_AES_KEY`, `WECOM_AGENT_ID` |
| Feishu/Lark delivery and bot | `FEISHU_WEBHOOK_URL`, `FEISHU_WEBHOOK_SECRET`, `FEISHU_WEBHOOK_KEYWORD`, `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_CHAT_ID`, `FEISHU_RECEIVE_ID_TYPE`, `FEISHU_DOMAIN`, `FEISHU_STREAM_ENABLED`, `FEISHU_VERIFICATION_TOKEN`, `FEISHU_ENCRYPT_KEY`, `FEISHU_FOLDER_TOKEN`, `FEISHU_MAX_BYTES` |
| DingTalk delivery and bot | `DINGTALK_APP_KEY`, `DINGTALK_APP_SECRET`, `DINGTALK_STREAM_ENABLED` |
| Telegram delivery and bot | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_MESSAGE_THREAD_ID`, `TELEGRAM_WEBHOOK_SECRET` |
| Email delivery | `EMAIL_SENDER`, `EMAIL_SENDER_NAME`, `EMAIL_PASSWORD`, `EMAIL_RECEIVERS`, `STOCK_GROUP_1`, `EMAIL_GROUP_1`, `STOCK_GROUP_2`, `EMAIL_GROUP_2`, `MERGE_EMAIL_NOTIFICATION` |
| Webhook/push delivery | `CUSTOM_WEBHOOK_URLS`, `CUSTOM_WEBHOOK_BEARER_TOKEN`, `CUSTOM_WEBHOOK_BODY_TEMPLATE`, `WEBHOOK_VERIFY_SSL`, `PUSHOVER_USER_KEY`, `PUSHOVER_API_TOKEN`, `NTFY_URL`, `NTFY_TOKEN`, `GOTIFY_URL`, `GOTIFY_TOKEN`, `PUSHPLUS_TOKEN`, `PUSHPLUS_TOPIC`, `SERVERCHAN3_SENDKEY`, `ASTRBOT_URL`, `ASTRBOT_TOKEN` |
| Discord/Slack delivery and bot | `DISCORD_WEBHOOK_URL`, `DISCORD_BOT_TOKEN`, `DISCORD_MAIN_CHANNEL_ID`, `DISCORD_CHANNEL_ID`, `DISCORD_INTERACTIONS_PUBLIC_KEY`, `DISCORD_BOT_STATUS`, `DISCORD_MAX_WORDS`, `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_WEBHOOK_URL` |
| Notification routing/noise | `NOTIFICATION_REPORT_CHANNELS`, `NOTIFICATION_ALERT_CHANNELS`, `NOTIFICATION_SYSTEM_ERROR_CHANNELS`, `NOTIFICATION_DEDUP_TTL_SECONDS`, `NOTIFICATION_COOLDOWN_SECONDS`, `NOTIFICATION_QUIET_HOURS`, `NOTIFICATION_TIMEZONE`, `NOTIFICATION_MIN_SEVERITY`, `NOTIFICATION_DAILY_DIGEST_ENABLED` |
| Report rendering/delivery format | `SINGLE_STOCK_NOTIFY`, `REPORT_TYPE`, `REPORT_LANGUAGE`, `REPORT_SUMMARY_ONLY`, `REPORT_SHOW_LLM_MODEL`, `REPORT_TEMPLATES_DIR`, `REPORT_RENDERER_ENABLED`, `REPORT_INTEGRITY_ENABLED`, `REPORT_INTEGRITY_RETRY`, `REPORT_HISTORY_COMPARE_N`, `MARKDOWN_TO_IMAGE_CHANNELS`, `MARKDOWN_TO_IMAGE_MAX_CHARS`, `MD2IMG_ENGINE` |
| Agent behavior, not provider credentials | `AGENT_MODE`, `AGENT_MAX_STEPS`, `AGENT_SKILLS`, `AGENT_SKILL_DIR`, `AGENT_STRATEGY_DIR`, `AGENT_NL_ROUTING`, `AGENT_ARCH`, `AGENT_ORCHESTRATOR_MODE`, `AGENT_ORCHESTRATOR_TIMEOUT_S`, `AGENT_RISK_OVERRIDE`, `AGENT_DEEP_RESEARCH_BUDGET`, `AGENT_DEEP_RESEARCH_TIMEOUT`, `AGENT_MEMORY_ENABLED`, `AGENT_SKILL_AUTOWEIGHT`, `AGENT_STRATEGY_AUTOWEIGHT`, `AGENT_SKILL_ROUTING`, `AGENT_STRATEGY_ROUTING`, `AGENT_CONTEXT_COMPRESSION_ENABLED`, `AGENT_CONTEXT_COMPRESSION_PROFILE`, `AGENT_CONTEXT_COMPRESSION_TRIGGER_TOKENS`, `AGENT_CONTEXT_PROTECTED_TURNS`, `AGENT_EVENT_MONITOR_ENABLED`, `AGENT_EVENT_MONITOR_INTERVAL_MINUTES`, `AGENT_EVENT_ALERT_RULES_JSON` |
| Storage/backtest/schedule/runtime | `ENV_FILE`, `DATABASE_PATH`, `SQLITE_WAL_ENABLED`, `SQLITE_BUSY_TIMEOUT_MS`, `SQLITE_WRITE_RETRY_MAX`, `SQLITE_WRITE_RETRY_BASE_DELAY`, `SAVE_CONTEXT_SNAPSHOT`, `BACKTEST_ENABLED`, `BACKTEST_EVAL_WINDOW_DAYS`, `BACKTEST_MIN_AGE_DAYS`, `BACKTEST_ENGINE_VERSION`, `BACKTEST_NEUTRAL_BAND_PCT`, `SCHEDULE_ENABLED`, `SCHEDULE_TIME`, `SCHEDULE_RUN_IMMEDIATELY`, `RUN_IMMEDIATELY`, `ANALYSIS_DELAY`, `USE_PROXY`, `PROXY_HOST`, `PROXY_PORT`, `LOG_DIR`, `LOG_LEVEL`, `DEBUG`, `CONFIG_VALIDATE_MODE` |
| Web UI and auth | `WEBUI_ENABLED`, `WEBUI_HOST`, `WEBUI_PORT`, `WEBUI_AUTO_BUILD`, `TRUST_X_FORWARDED_FOR`, `ADMIN_AUTH_ENABLED`, `ADMIN_SESSION_MAX_AGE_HOURS` |
| Bot shell | `BOT_ENABLED`, `BOT_COMMAND_PREFIX`, `BOT_RATE_LIMIT_REQUESTS`, `BOT_RATE_LIMIT_WINDOW`, `BOT_ADMIN_USERS` |

## Market Data Providers

| Provider | Markets | Needs key | Typical use | Canonical config |
| --- | --- | --- | --- | --- |
| Efinance / Eastmoney | CN A-share, ETF, indices, sectors | No | Free daily/realtime A-share data; broad but may trigger anti-bot limits | `EFINANCE_PRIORITY`, `EFINANCE_CALL_TIMEOUT`, `ENABLE_EASTMONEY_PATCH` |
| AkShare | CN A-share, ETF, HK, indices, chip/fundamental endpoints | No | Flexible free source wrapping Eastmoney/Sina/Tencent and many finance endpoints | `AKSHARE_PRIORITY`, `AKSHARE_SLEEP_MIN`, `AKSHARE_SLEEP_MAX`, `ENABLE_EASTMONEY_PATCH` |
| Tencent realtime | CN A-share | No | Stable single-symbol realtime quote with volume ratio, turnover, PE/PB when available | `REALTIME_SOURCE_PRIORITY=tencent,...` |
| Sina realtime | CN A-share | No | Stable basic realtime fallback; fewer fields | `REALTIME_SOURCE_PRIORITY=akshare_sina,...` |
| Tushare Pro | CN A-share, ETF, indices, calendar, fundamentals | Yes | Higher-quality CN history, trading calendar, stock list, sector/fundamental data; quota/points vary | `TUSHARE_TOKEN`, `TUSHARE_RATE_LIMIT_PER_MINUTE`, `TUSHARE_PRIORITY` |
| Pytdx / Tongdaxin | CN A-share | No | Direct quote servers for CN daily/realtime fallback | `PYTDX_HOST`, `PYTDX_PORT`, `PYTDX_SERVERS`, `PYTDX_PRIORITY` |
| Baostock | CN A-share | No | T+1 daily-data fallback; login/logout lifecycle | `BAOSTOCK_PRIORITY` |
| Yahoo Finance / yfinance | US, HK, global, some CN | No | Global daily/realtime fallback and fundamentals; may be delayed or partial | `YFINANCE_PRIORITY` |
| Stooq | US | No | Last-resort US quote/history fallback when Yahoo fails | usually no config |
| Longbridge OpenAPI | HK, US | Yes | Better HK/US quote fields, turnover, valuation, candlesticks; OAuth or legacy credentials | `LONGBRIDGE_OAUTH_CLIENT_ID`, `LONGBRIDGE_OAUTH_TOKEN_CACHE_B64`, `LONGBRIDGE_APP_KEY`, `LONGBRIDGE_APP_SECRET`, `LONGBRIDGE_ACCESS_TOKEN`, `LONGBRIDGE_REGION`, `LONGBRIDGE_HTTP_URL`, `LONGBRIDGE_QUOTE_WS_URL`, `LONGBRIDGE_TRADE_WS_URL`, `LONGBRIDGE_STATIC_INFO_TTL_SECONDS`, `LONGBRIDGE_CONNECTION_COOLDOWN_SECONDS` |
| Finnhub | US | Yes | US daily/realtime fallback and symbol lookup | `FINNHUB_API_KEY` |
| AlphaVantage | US and global | Yes | US/global daily/realtime fallback; free quotas are usually small | `ALPHAVANTAGE_API_KEY` |
| TickFlow | CN market review | Yes | CN market-review indices and breadth when account permissions allow | `TICKFLOW_API_KEY` |
| Remote stock index JSON | CN, HK, US, BSE symbol autocomplete | No | Refresh stock-code/name index from a maintained JSON endpoint; should fall back to local index if unavailable | `STOCK_INDEX_REMOTE_UPDATE_ENABLED` |
| AlphaSift | CN stock screening/candidate discovery | Optional LLM/data keys depending on setup | Full-market screening, ranking, and candidate generation; usually reuses market-data and LLM providers | `ALPHASIFT_ENABLED`, `ALPHASIFT_INSTALL_SPEC`, `SNAPSHOT_SOURCE_PRIORITY` |

## Embedded Free Subsources

Some adapters expose several underlying websites or endpoints through one library. Treat them as implementation subsources, but mention them when troubleshooting coverage or blocking.

| Wrapper | Underlying source | Typical data |
| --- | --- | --- |
| Efinance | Eastmoney | CN daily K-line, realtime quote, ETFs, sectors, market stats |
| AkShare | Eastmoney | CN daily/realtime, HK realtime, chip distribution, hot stocks, fundamentals |
| AkShare | Sina | CN basic realtime, US daily, HK fallback, indices |
| AkShare | Tencent | CN single-symbol realtime quote |
| AkShare | Xueqiu | Hot/followed stocks fallback when Eastmoney hot lists fail |
| Tushare Pro | Tushare THS/Eastmoney-style endpoints | Trading calendar, fundamentals, industry money flow, market review extras |

These subsources usually do not need separate API keys. They may need lower concurrency, sleeps, circuit breakers, cache TTLs, or an Eastmoney anti-bot patch.

## Suggested Fallback Order

Do not force one universal order. Use market-aware routing.

| Capability | Suggested order |
| --- | --- |
| CN daily K-line | `tushare -> efinance -> akshare -> pytdx -> baostock -> yfinance` |
| CN realtime quote | `tencent -> akshare_sina -> efinance -> akshare_em -> tushare` |
| HK daily/realtime | `longbridge -> akshare -> yfinance` or `akshare -> yfinance -> longbridge` if no Longbridge credentials |
| US stock daily | `longbridge -> finnhub -> alphavantage -> yfinance -> stooq` |
| US stock realtime | `longbridge -> yfinance -> finnhub -> alphavantage -> stooq` |
| US indices | `yfinance -> stooq`; do not assume Longbridge supports index K-line |
| CN market review | `tickflow -> efinance -> akshare -> tushare -> yfinance` |
| Fundamentals CN | `realtime valuation -> akshare fundamentals -> tushare if available` |
| Fundamentals HK/US | `yfinance fundamentals -> longbridge quote/static info` |

When `TUSHARE_TOKEN` is configured and the user did not set realtime order, it is reasonable to prepend `tushare` for CN realtime only if the account has the required points/permissions. Otherwise keep Tencent/Sina first.

## News And Search Providers

News/search is separate from market quotes. Configure at least one if reports need recent catalysts, announcements, risk events, or macro context.

| Provider | Needs key | Best for | Canonical config |
| --- | --- | --- | --- |
| Anspire Search | Yes | Chinese stock news, A-share context; may also share key with Anspire LLM gateway | `ANSPIRE_API_KEYS` |
| Bocha | Yes | Chinese web search with summaries | `BOCHA_API_KEYS` |
| Tavily | Yes | General AI search, news topic search | `TAVILY_API_KEYS` |
| SerpAPI | Yes | Google/Baidu-style search, answer boxes, finance cards | `SERPAPI_API_KEYS` |
| Brave Search | Yes | Privacy-oriented global search and US-stock news | `BRAVE_API_KEYS` |
| MiniMax Web Search | Yes | Structured search through MiniMax/Coding Plan style APIs | `MINIMAX_API_KEYS` |
| SearXNG | Optional | Self-hosted quota-free fallback; public instances are less reliable | `SEARXNG_BASE_URLS`, `SEARXNG_PUBLIC_INSTANCES_ENABLED` |

Recommended provider order: `Anspire -> Bocha -> Tavily -> Brave -> SerpAPI -> MiniMax -> SearXNG`. If the target app supports scoring/filtering, prefer direct company news, official exchange filings, earnings, guidance, buyback, dividends, litigation, policy, industry, and macro signals over generic SEO results.

## Social Sentiment

Use this only for US tickers unless the data provider explicitly supports other markets.

| Provider | Data | Config |
| --- | --- | --- |
| api.adanos.org / Stock Sentiment style API | Reddit, X/Twitter, Polymarket trend and per-ticker sentiment | `SOCIAL_SENTIMENT_API_KEY`, `SOCIAL_SENTIMENT_API_URL` |

Failure to fetch social sentiment must not block price analysis.

## LLM And Vision Providers

LLM providers are not market-data sources, but they are often required to generate reports, classify news, run agents, or extract stock codes from images.

### Simple legacy keys

| Provider | Config |
| --- | --- |
| Anspire Open | `ANSPIRE_API_KEYS`, `ANSPIRE_LLM_ENABLED`, `ANSPIRE_LLM_MODEL`, `ANSPIRE_LLM_BASE_URL` |
| AIHubmix | `AIHUBMIX_KEY` |
| Gemini | `GEMINI_API_KEY`, `GEMINI_API_KEYS`, `GEMINI_MODEL`, `GEMINI_MODEL_FALLBACK` |
| DeepSeek | `DEEPSEEK_API_KEY`, `DEEPSEEK_API_KEYS` |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_API_KEYS`, `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_TOKENS` |
| OpenAI or OpenAI-compatible | `OPENAI_API_KEY`, `OPENAI_API_KEYS`, `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| Ollama/local | `OLLAMA_API_BASE`, `LITELLM_MODEL=ollama/<model>` |

### Common channel providers

These providers normally use channel mode. The exact model names change over time, so use the user's provider console as the source of truth.

| Provider | Protocol | Canonical channel config |
| --- | --- | --- |
| Anspire Open | `openai` | `LLM_ANSPIRE_PROTOCOL`, `LLM_ANSPIRE_BASE_URL`, `LLM_ANSPIRE_API_KEY`, `LLM_ANSPIRE_API_KEYS`, `LLM_ANSPIRE_MODELS` |
| AIHubmix | `openai` | `LLM_AIHUBMIX_PROTOCOL`, `LLM_AIHUBMIX_BASE_URL`, `LLM_AIHUBMIX_API_KEY`, `LLM_AIHUBMIX_API_KEYS`, `LLM_AIHUBMIX_MODELS` |
| OpenAI | `openai` | `LLM_OPENAI_PROTOCOL`, `LLM_OPENAI_BASE_URL`, `LLM_OPENAI_API_KEY`, `LLM_OPENAI_API_KEYS`, `LLM_OPENAI_MODELS` |
| DeepSeek | `deepseek` | `LLM_DEEPSEEK_PROTOCOL`, `LLM_DEEPSEEK_BASE_URL`, `LLM_DEEPSEEK_API_KEY`, `LLM_DEEPSEEK_API_KEYS`, `LLM_DEEPSEEK_MODELS` |
| Gemini | `gemini` | `LLM_GEMINI_PROTOCOL`, `LLM_GEMINI_API_KEY`, `LLM_GEMINI_API_KEYS`, `LLM_GEMINI_MODELS` |
| Anthropic | `anthropic` | `LLM_ANTHROPIC_PROTOCOL`, `LLM_ANTHROPIC_API_KEY`, `LLM_ANTHROPIC_API_KEYS`, `LLM_ANTHROPIC_MODELS`, `LLM_ANTHROPIC_BASE_URL` |
| Moonshot / Kimi | `openai` | `LLM_MOONSHOT_PROTOCOL`, `LLM_MOONSHOT_BASE_URL`, `LLM_MOONSHOT_API_KEY`, `LLM_MOONSHOT_API_KEYS`, `LLM_MOONSHOT_MODELS` |
| DashScope / Qwen | `openai` | `LLM_DASHSCOPE_PROTOCOL`, `LLM_DASHSCOPE_BASE_URL`, `LLM_DASHSCOPE_API_KEY`, `LLM_DASHSCOPE_API_KEYS`, `LLM_DASHSCOPE_MODELS` |
| Zhipu / GLM | `openai` | `LLM_ZHIPU_PROTOCOL`, `LLM_ZHIPU_BASE_URL`, `LLM_ZHIPU_API_KEY`, `LLM_ZHIPU_API_KEYS`, `LLM_ZHIPU_MODELS` |
| MiniMax LLM | `openai` | `LLM_MINIMAX_PROTOCOL`, `LLM_MINIMAX_BASE_URL`, `LLM_MINIMAX_API_KEY`, `LLM_MINIMAX_API_KEYS`, `LLM_MINIMAX_MODELS` |
| MiMo | `openai` | `LLM_MIMO_PROTOCOL`, `LLM_MIMO_BASE_URL`, `LLM_MIMO_API_KEY`, `LLM_MIMO_API_KEYS`, `LLM_MIMO_MODELS` |
| Volcengine / Doubao | `openai` | `LLM_VOLCENGINE_PROTOCOL`, `LLM_VOLCENGINE_BASE_URL`, `LLM_VOLCENGINE_API_KEY`, `LLM_VOLCENGINE_API_KEYS`, `LLM_VOLCENGINE_MODELS` |
| SiliconFlow | `openai` | `LLM_SILICONFLOW_PROTOCOL`, `LLM_SILICONFLOW_BASE_URL`, `LLM_SILICONFLOW_API_KEY`, `LLM_SILICONFLOW_API_KEYS`, `LLM_SILICONFLOW_MODELS` |
| OpenRouter | `openai` | `LLM_OPENROUTER_PROTOCOL`, `LLM_OPENROUTER_BASE_URL`, `LLM_OPENROUTER_API_KEY`, `LLM_OPENROUTER_API_KEYS`, `LLM_OPENROUTER_MODELS` |
| Ollama/local | `ollama` or OpenAI-compatible | `LLM_OLLAMA_BASE_URL`, `LLM_OLLAMA_MODELS`, or an OpenAI-compatible local endpoint |

Use `LITELLM_CONFIG` or `LITELLM_CONFIG_YAML` for advanced LiteLLM routing when the app supports native YAML/model-list configuration. If YAML is configured, document whether it overrides channel and legacy key settings.

### Channel mode

Use channel mode when the user needs multiple providers, multiple keys, custom base URLs, or fallback.

```bash
LLM_CHANNELS=deepseek,gemini,custom_proxy

LLM_DEEPSEEK_PROTOCOL=deepseek
LLM_DEEPSEEK_BASE_URL=https://api.deepseek.com
LLM_DEEPSEEK_API_KEY=
LLM_DEEPSEEK_MODELS=deepseek-chat,deepseek-reasoner

LLM_GEMINI_PROTOCOL=gemini
LLM_GEMINI_API_KEYS=
LLM_GEMINI_MODELS=gemini-pro,gemini-flash

LLM_CUSTOM_PROXY_PROTOCOL=openai
LLM_CUSTOM_PROXY_BASE_URL=https://example.com/v1
LLM_CUSTOM_PROXY_API_KEY=
LLM_CUSTOM_PROXY_MODELS=gpt-compatible-model

LITELLM_MODEL=deepseek/deepseek-chat
LITELLM_FALLBACK_MODELS=gemini/gemini-flash,openai/gpt-compatible-model
```

For image recognition or screenshot-to-stock-code extraction, configure `VISION_MODEL` explicitly if the primary model lacks vision support.

## Provider Selection Rules

- Prefer no-key sources for first run, but warn that they may be delayed, blocked, or incomplete.
- Prefer paid/keyed sources for scheduled production runs, batch jobs, or public deployments.
- Use low concurrency for scraper-style sources: keep `MAX_WORKERS` small and add random sleeps.
- Use single-symbol sources first for realtime if full-market pulls are triggering anti-bot blocks.
- Cache realtime and fundamentals for a short TTL to reduce repeated provider calls.
- Keep proxies away from domestic CN finance domains unless required; set `NO_PROXY` for Eastmoney, Sina, Tushare, Baostock, SSE, SZSE, localhost.
- Redact secrets in logs. Log only provider name, market, endpoint class, status, latency, error type, and fallback target.

## Validation Checklist

Use fake or redacted keys in examples; use real keys only in the user's local secret store.

1. Check env parsing: missing keys should disable optional providers instead of crashing.
2. Test one symbol per market:
   - CN: `600519` or `300750`
   - HK: `HK00700` or `00700.HK`
   - US: `AAPL` or `TSLA`
3. Test one index if supported:
   - CN: `000001.SH` / 上证指数
   - US: `SPX` / `^GSPC`
4. Confirm daily data includes date, open, high, low, close, volume, pct change or enough fields to compute it.
5. Confirm realtime data includes price and timestamp; mark stale data if provider timestamp is old.
6. Confirm provider fallback by temporarily disabling the first provider.
7. Confirm quota/rate-limit errors are surfaced with actionable messages.
8. Confirm no real key appears in logs, screenshots, reports, or saved config exports.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| API key configured but provider not used | Variable name mismatch or channel mode overriding legacy keys | Map canonical env names to app-specific config; check active config tier |
| CN realtime blocked or slow | Full-market Eastmoney pull hit anti-bot or timeout | Put `tencent,akshare_sina` before `efinance,akshare_em`; lower concurrency; increase cache TTL |
| Tushare returns no data | Missing token, insufficient points, wrong symbol format, quota limit | Validate `TUSHARE_TOKEN`; try a known A-share; reduce rate; fall back to free sources |
| HK/US fields missing | Yahoo data partial or delayed | Add Longbridge, Finnhub, or AlphaVantage; treat valuation fields as optional |
| Longbridge fails in headless runner | OAuth token cache missing or legacy credentials incomplete | Use `LONGBRIDGE_OAUTH_TOKEN_CACHE_B64` or legacy `APP_KEY/APP_SECRET/ACCESS_TOKEN`; verify region/endpoints |
| News search empty | No search key, stale window too narrow, public SearXNG unavailable | Add one keyed provider; widen `NEWS_MAX_AGE_DAYS`; disable unreliable public instances |
| LLM works locally but not in workflow | CI/Docker did not pass env variables | Add secrets/variables to workflow or container environment; avoid committing `.env` |
| Provider works but reports fail | Report pipeline assumes non-null fields | Normalize missing fields to `None`/empty blocks and keep report generation fail-open |

## Common Mistakes

- Assuming market data, news search, social sentiment, and LLM providers are one system. Configure and test them separately.
- Requiring every user to configure every API. Most users need one market-data key, one search key, and one LLM key at most.
- Putting high-quota paid providers behind unstable free scrapers in production.
- Treating realtime quote order as daily K-line order; they should be separate.
- Logging full request URLs containing tokens.
- Calling live APIs in tests without opt-in smoke markers.
- Failing startup when an optional provider is absent.

## Handoff Prompt For Another Agent

Use this prompt when giving the skill to OpenClaw or another agent:

```text
Use the portable stock data sources skill at <path>/data-sources/SKILL.md.
Do not assume any specific repository layout. First identify my target markets and required capabilities, then help me choose providers and configure API keys using the canonical env names in the skill. Keep secrets out of chat and logs. If my app uses different variable names, map the skill's canonical names to my app's settings. If I provide a local .env path, run scripts/check_config.py to audit provider readiness offline before suggesting live API tests.
```
