# DA-Stock 问股引擎迁移说明

## 结论

AI研判现在运行的是迁入本仓库的 DA-Stock 问股核心，不依赖 `18000` 端口，也不是通过 HTTP 调用另一套项目。源代码快照位于 `services/da-stock/upstream`，当前对齐的源版本为 `12a7e6d3c76b8b70ee0a7ac4e541e1edf26637b2`。

迁入范围包括：

- `src/agent` 的 AgentExecutor、协调器、阶段编排、模型路由、上下文、记忆、技能和工具注册。
- `data_provider`、`data-sources`、`stock-data-enhanced` 的行情、财务、新闻、搜索及 Provider 回退链。
- 15 个 YAML 研究技能、18 个问股工具、提示词模板和 Python 依赖。
- 原项目的多模型通道及回退配置；本项目已有 DeepSeek 配置仍作为首选，不被覆盖。

## 运行架构

```text
AI研判 Web
  -> Next API /api/ai/research/stream
  -> executeDAStockResearch.ts（会话、取消、持久化）
  -> daStockEngine.ts（本地子进程生命周期与 NDJSON 协议）
  -> services/da-stock/bridge.py
  -> 原版 build_agent_executor(...).chat(...)
  -> 原版协调 Agent / 专家 Agent / 工具 / Provider / 模型回退
```

`bridge.py` 只是进程适配层：把原引擎的异步事件转换成私有 stdin/stdout NDJSON 协议。它不实现第二套研究逻辑，不开放独立服务端口，也不生成兜底报告。原项目停止运行后，AI研判仍可由本项目独立启动。

## 回答与思考过程

- 用户可输入任意金融问题，不要求股票代码、公司名称或固定句式。
- 没有选择技能时，由原版协调 Agent 根据问题自主规划；最多可显式选择 3 个原版技能。
- 页面展示原引擎实际发出的阶段、Agent、工具、耗时和成功/失败状态，不补造“思考步骤”。
- 最终回答原样保存为 `answerMarkdown`，使用自由 Markdown 渲染；前端不再把它重组为固定的公司、行业、催化、风险模板。
- 追问会携带同一会话的历史消息，保留原版上下文处理逻辑。
- 模型、工具或数据源失败时显示真实失败原因，不用旧证据摘要冒充本轮 AI 回答。

## 数据源与模型配置

运行时按以下优先级装配环境：

1. 本项目服务端环境与 `.env.local`，因此现有 `DEEPSEEK_*` 配置保持首选。
2. `services/da-stock/upstream/.env` 中迁入的原项目私有通道配置，仅用于本地运行并被 Git 忽略。
3. 原版 Provider 与模型默认值及回退逻辑。

源码附带的 `.env.example` 保留在迁移目录，便于配置 Tushare、Finnhub、Alpha Vantage、Tavily、SerpAPI、Bocha、MiniMax Search 等原版通道。浏览器目录接口只返回 Provider 名称、能力与是否接入，不返回密钥。

已进行真实链路验证：

- 主要市场指数工具可返回真实指数数据。
- 行业排名会执行原版 Tushare、efinance、Akshare 与新浪回退链。
- 个股新闻搜索可通过已配置的 Bocha 通道返回来源。
- 当前模型请求已进入原版模型路由并依次尝试本项目 DeepSeek 主模型及迁入的回退模型。

若所有模型账户均返回余额不足，接口明确返回“当前模型账户余额不足，已尝试全部配置的回退模型”。这是外部账户状态，不会被模板报告掩盖。

## 本地准备

Python 3.11 环境默认位于 `services/da-stock/.venv`。可用以下命令建立运行环境：

```bash
uv venv --python 3.11 --allow-existing services/da-stock/.venv
uv pip install --python services/da-stock/.venv/bin/python -r services/da-stock/upstream/requirements.txt
```

Next 服务会优先使用该环境；没有本地环境时可通过 `DA_STOCK_IMAGE` 使用容器镜像。standalone 打包会包含迁入源码，但排除 `.env`、数据库、虚拟环境、缓存和字节码。

## 验收清单

- `diff -qr` 校验迁入核心目录与源项目一致。
- TypeScript 类型检查通过。
- 引擎协议、动态进度、错误边界、AI研判组件与工具路由测试通过。
- `/api/ai/research/skills` 返回 15 个原版技能。
- `/api/ai/research/tools` 返回 18 个原版工具。
- `/api/ai/research/providers` 与 `/models` 由原版运行目录动态生成。
- 端到端请求不依赖 `http://127.0.0.1:18000`。

## 安全边界

私有 `.env`、数据库、会话历史、虚拟环境和缓存均被 Git 忽略，standalone 产物也不会复制这些文件。密钥只进入服务端子进程环境，不进入浏览器、回答正文、会话数据库或执行日志。
