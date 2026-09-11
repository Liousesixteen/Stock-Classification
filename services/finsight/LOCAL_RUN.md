# FinSight 本地运行

本项目的 Python、浏览器、前端和 Pandoc 依赖均安装在 `FinSight` 目录内。

## 目录

```text
.venv/                         Python 及 Python 包
.playwright-browsers/          Chromium 和 FFmpeg
.tools/bin/pandoc              项目内 Pandoc 启动器
.cache/                        Matplotlib、模型等运行缓存
.crawl4ai/                     Crawl4AI 数据库和缓存
demo/frontend/node_modules/    前端依赖
```

## 首次配置

在 `.env` 中填入有效凭据：

```dotenv
DS_MODEL_NAME=...
DS_BASE_URL=...
DS_API_KEY=...

VLM_MODEL_NAME=...
VLM_BASE_URL=...
VLM_API_KEY=...

EMBEDDING_MODEL_NAME=...
EMBEDDING_BASE_URL=...
EMBEDDING_API_KEY=...

SERPER_API_KEY=...
```

当前 `.env` 中的 API Key 仍是 `YOUR-API-KEY` 占位符，真实研究流水线会返回 401。

## 最小闭环

使用 smoke 配置运行单采集任务、单分析任务，关闭自动扩展任务、图表和参考文献：

```bash
./run_local.sh \
  --config docs/example_configs/smoke_config.yaml \
  --no-resume \
  --no-generate-tasks \
  --no-charts \
  --no-references \
  --max-concurrent 1 \
  --max-iterations 3
```

输出目录：

```text
outputs/smoke/local_Apple Inc./
```

## 正式配置

```bash
./run_local.sh \
  --config my_config.yaml \
  --max-concurrent 3 \
  --max-iterations 20
```

正式任务默认启用断点恢复、自动任务扩展、图表生成和参考文献。

## Web UI

后端：

```bash
./run_backend_local.sh
```

前端：

```bash
cd demo/frontend
npm run dev
```

打开 `http://localhost:3000`。

## PDF 权限

Markdown 和 DOCX 导出已验证。macOS 上的 PDF 转换通过 Microsoft Word 自动化完成。

如果出现错误 `-1743`，请在“系统设置 → 隐私与安全性 → 自动化”中允许当前终端/Codex 控制 Microsoft Word，然后重新运行转换。未授权时，报告仍可生成 Markdown 和 DOCX，但不会产生 PDF。
