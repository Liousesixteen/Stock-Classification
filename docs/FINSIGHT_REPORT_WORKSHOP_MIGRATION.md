# FinSight 完整核心迁移与报告工坊接入

报告工坊同时提供“证据约束引擎”和“FinSight 完整引擎”。后者不是仿写或缩减实现，而是把本机
`/Users/ccdemac/DevProjs/Paper-Experiment/FinSight` 的非前端核心以独立 Python 服务完整迁入
`services/finsight`，再通过薄适配层接入现有 Next.js 界面、SQLite 报告库和导出入口。

## 完整迁移范围

- `src/agents`：BaseAgent、DataCollector、DataAnalyzer、DeepSearchAgent、ReportGenerator 和 Report/Section 模型。
- `src/memory`：任务映射、依赖关系、变量记忆、Embedding 索引和 dill 检查点恢复。
- `src/tools`：金融报表、行情、公司、行业、宏观、美国宏观、搜索和网页抓取工具注册表。
- `src/utils`：LLM/VLM/Embedding 客户端、限流、异步桥、代码沙箱、图表、PDF、日志和 Prompt Loader。
- `src/**/prompts`：公司、行业、宏观、治理、通用研究的完整提示词。
- `src/template`：公司/行业大纲、DOCX 参考模板、烟雾测试模板和中文字体。
- `run_report.py`：自动任务生成、优先级分层、层内并发、失败汇总、断点续跑的原始编排入口。
- `demo/backend`：配置、任务、执行状态、报告列表/预览/下载和 WebSocket 日志的完整 FastAPI 后端。
- 根配置与工程文件：`pyproject.toml`、`requirements.txt`、`pytest.ini`、示例配置、运行脚本、README、开发文档和 GPL-3.0 LICENSE。
- `tests`：上游全部单元、组件、Agent、工具、沙箱、动态日期、限流、恢复和报告生成测试。

明确不迁入的只有：`demo/frontend`、`.env`、`.git`、虚拟环境、缓存、浏览器运行时、历史 outputs、
宣传视频和示例成品报告。它们不属于核心代码；密钥与运行产物也不应进入仓库。架构图、说明图片、
模板、字体和全部测试均已保留。

## 实际调用链

```text
报告工坊
  -> POST /api/ai/reports (engine=finsight, NDJSON)
  -> src/lib/finsight/runtime.ts
  -> services/finsight/integration/report_workshop_bridge.py
  -> run_report.run_report
  -> DataCollector[] -> DataAnalyzer[] -> ReportGenerator
  -> Memory / checkpoints / tools / prompts
  -> Markdown + DOCX + PDF
  -> research_documents + immutable version 1 + artifact metadata
```

适配层只负责目标与配置翻译、动态写入与现有编辑器一致的 8–9 节大纲、进度事件、引用编号规范化、
成品登记和安全路径校验。Agent、工具、记忆、任务生成、章节生成、后处理和 Pandoc 渲染仍由迁入的
FinSight 原始核心执行。报告工坊再次导出 Word/PDF 时优先返回 FinSight 原生文件；原始文件不存在时
才使用现有导出器重建。

## 安装与配置

FinSight 要求 Python 3.10+、Pandoc 和对应 Python 依赖：

```bash
npm run finsight:setup
```

完整模式默认开启图表，不会在缺少模型时静默缩减。除现有 DeepSeek 配置外，需要配置：

```dotenv
FINSIGHT_REPORT_ENGINE=native
FINSIGHT_PYTHON_BIN=services/finsight/.venv/bin/python
FINSIGHT_ENABLE_CHARTS=true
FINSIGHT_VLM_MODEL_NAME=
FINSIGHT_VLM_BASE_URL=
FINSIGHT_VLM_API_KEY=
FINSIGHT_EMBEDDING_MODEL_NAME=
FINSIGHT_EMBEDDING_BASE_URL=
FINSIGHT_EMBEDDING_API_KEY=
```

`FINSIGHT_REPORT_ENGINE=finsight` 可把已就绪环境的默认选项切到完整引擎；用户仍可在报告工坊逐次选择。
`FINSIGHT_ENABLE_CHARTS=false` 可显式关闭 VLM 图表环节，但引用匹配仍需要 Embedding。可选参数包括
`FINSIGHT_MAX_CONCURRENT`、`FINSIGHT_MAX_ITERATIONS`、`FINSIGHT_RESUME`、`FINSIGHT_GENERATE_TASKS`、
`FINSIGHT_ADD_REFERENCES` 和 `FINSIGHT_RUNS_DIR`。

## 数据、恢复与安全边界

- 每次完整运行写入 `data/finsight-runs/<run-id>`；请求 JSON 不含 API Key。
- Agent 记忆、任务映射和章节/后处理检查点保存在该次运行目录中，可按 FinSight 原始机制恢复。
- 报告表记录 `engine` 与 `artifacts_json`；版本编辑仍沿用现有不可变版本链。
- 下载原生成品前会再次确认路径位于 `FINSIGHT_RUNS_DIR`，数据库中的任意外部路径不会被读取。
- GPL-3.0 许可证保留在 `services/finsight/LICENSE`。分发包含这部分代码的构建时必须遵守该许可证。

## 验证

```bash
npm run finsight:test
npm run typecheck
npm run lint
npm test
npm run build
```

没有真实模型 Key 时仍可执行上游离线测试、桥接脚本语法检查、运行时状态接口和 Next.js 全量验证；
真实完整研报验收需要 LLM、Embedding、VLM、搜索服务和 Pandoc 均可用。
