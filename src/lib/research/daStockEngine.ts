import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import type { ResearchProgressEvent } from "./researchProgress";

type EngineEvent = Record<string, unknown> & { type: string };
const root = () => path.join(process.cwd(), "services/da-stock");
const toolLabels: Record<string, string> = {
  get_realtime_quote: "实时行情", get_daily_history: "历史 K 线", get_chip_distribution: "筹码分布",
  get_analysis_context: "综合分析上下文", get_stock_info: "股票基本信息", get_portfolio_snapshot: "组合快照",
  search_stock_news: "最新资讯搜索",
  search_comprehensive_intel: "综合情报检索", analyze_trend: "趋势分析", calculate_ma: "均线计算",
  get_volume_analysis: "量价分析", analyze_pattern: "形态识别", get_market_indices: "主要市场指数",
  get_sector_rankings: "行业板块排行", get_capital_flow: "资金流向",
  get_skill_backtest_summary: "技能回测摘要", get_strategy_backtest_summary: "策略回测摘要",
  get_stock_backtest_summary: "个股回测摘要",
};
const toolDescriptions: Record<string, string> = {
  get_realtime_quote: "读取实时价格、涨跌幅、量比、换手率、PE、PB 与市值。",
  get_daily_history: "读取日线 OHLCV 与常用均线，用于趋势和形态研究。",
  get_chip_distribution: "分析获利盘、平均成本与筹码集中度，辅助判断支撑和压力。",
  get_analysis_context: "读取历史分析上下文、近期量价和均线状态。",
  get_stock_info: "读取估值、成长、盈利、机构资金、所属板块与行业排名。",
  get_portfolio_snapshot: "读取组合摘要、持仓明细与风险分块（如已配置）。",
  get_capital_flow: "读取 A 股个股与行业的主力资金流向。",
  analyze_trend: "综合均线、乖离率、MACD、RSI、量能及支撑压力研判趋势。",
  calculate_ma: "计算自定义周期均线、价格乖离与均线排列。",
  get_volume_analysis: "分析放量、缩量、量价配合与背离。",
  analyze_pattern: "识别十字星、锤头、吞没、双底、突破、箱体等 K 线与图形形态。",
  search_stock_news: "检索指定股票的最新新闻、摘要、来源与原文链接。",
  search_comprehensive_intel: "并行检索新闻、市场观点、风险、业绩预期和行业趋势。",
  get_market_indices: "读取中国、美国等主要市场指数概览。",
  get_sector_rankings: "读取当日领涨与领跌行业，辅助分析板块轮动。",
  get_skill_backtest_summary: "读取指定技能已有的回测汇总，不触发新回测。",
  get_strategy_backtest_summary: "读取策略整体历史回测汇总，不触发新回测。",
  get_stock_backtest_summary: "读取指定股票的胜率、准确率、平均收益和近期评估记录。",
};

export function localizeCatalogTool(tool: Record<string, unknown>) {
  const id = String(tool.id || tool.name || "");
  return {
    ...tool,
    id,
    name: toolLabels[id] || String(tool.name || id),
    description: toolDescriptions[id] || String(tool.description || "由迁移后的问股引擎按需调用。"),
  };
}
const stageLabels: Record<string, string> = {
  technical: "技术分析 Agent", intel: "情报检索 Agent", risk: "风险审查 Agent",
  decision: "决策汇总 Agent", portfolio: "组合分析 Agent", skill_consensus: "技能共识 Agent",
};

export function engineEnvironment(): Record<string, string> {
  const source = readFileSync(path.join(root(), "upstream/src/config.py"), "utf8");
  const names = new Set([...source.matchAll(/os\.getenv\(['"]([A-Z0-9_]+)['"]/g)].map((m) => m[1]));
  const example = readFileSync(path.join(root(), "upstream/.env.example"), "utf8");
  for (const match of example.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]*)=/gm)) names.add(match[1]);
  const env: Record<string, string> = {};
  const researchConfig = /^(?:AGENT_|LLM_|LITELLM_|DEEPSEEK_|OPENAI_|GEMINI_|ANTHROPIC_|ANSPIRE_|TUSHARE_|TICKFLOW_|FINNHUB_|ALPHAVANTAGE_|LONGBRIDGE_|TAVILY_|SERPAPI_|BRAVE_|BOCHA_|MINIMAX_|SOCIAL_SENTIMENT_|REPORT_LANGUAGE$|MARKET_)/;
  for (const name of names) if (researchConfig.test(name) && process.env[name]) env[name] = process.env[name]!;
  if (process.env.DEEPSEEK_API_KEY) {
    env.OPENAI_API_KEY = process.env.DEEPSEEK_API_KEY;
    env.OPENAI_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    env.OPENAI_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
    env.LITELLM_MODEL = process.env.AGENT_LITELLM_MODEL || `openai/${env.OPENAI_MODEL}`;
  }
  env.AGENT_MODE = "true";
  env.AGENT_ARCH = process.env.AGENT_ARCH || "multi";
  return env;
}

export function mapEngineProgress(event: EngineEvent): ResearchProgressEvent | null {
  const types: Record<string, ResearchProgressEvent["type"]> = {
    thinking: "thinking", generating: "generating", tool_start: "tool_start", tool_done: "tool_done",
    stage_start: "agent_start", stage_done: "agent_done", pipeline_timeout: "agent_done",
  };
  const type = types[event.type];
  if (!type) return null;
  const rawTool = String(event.tool || "");
  const rawStage = String(event.stage || "");
  const label = String(event.display_name || toolLabels[rawTool] || stageLabels[rawStage]
    || (rawStage.startsWith("skill_") ? "策略分析 Agent" : rawTool || rawStage));
  const failed = event.success === false || event.type === "pipeline_timeout" || event.status === "failed";
  const lifecycleMessage = event.type === "tool_start" ? `正在调用${label}`
    : event.type === "tool_done" ? `${label}${failed ? "调用失败" : "已返回结果"}`
      : event.type === "stage_start" ? `正在启动${label}`
        : event.type === "stage_done" ? `${label}${failed ? "执行失败" : "已完成"}`
          : event.type === "pipeline_timeout" ? `${label}执行超时` : "";
  return {
    type, step: Number(event.step || 0), tool: event.tool ? String(event.tool) : undefined,
    stageId: event.stage ? String(event.stage) : undefined, displayName: label,
    message: lifecycleMessage || String(event.message || `${label}${failed ? "未成功，保留失败状态" : "已完成"}`),
    success: type.endsWith("done") ? !failed : undefined,
    durationMs: typeof event.duration === "number" ? event.duration * 1000 : undefined,
    createdAt: new Date().toISOString(),
  };
}

export function publicEngineError(event?: EngineEvent) {
  const detail = String(event?.error || event?.message || "");
  if (/insufficient balance/i.test(detail)) return "当前模型账户余额不足，已尝试全部配置的回退模型";
  if (/authentication|unauthorized|invalid[^\n]*(?:key|token)/i.test(detail)) return "模型凭据无效，请检查模型渠道配置";
  if (/rate.?limit|too many requests/i.test(detail)) return "模型服务请求过于频繁，请稍后重试";
  if (/timeout|timed out/i.test(detail)) return "问股引擎执行超时，请稍后重试";
  return `问股引擎未完成${event?.error_class ? `（${event.error_class}）` : "，请检查模型与运行环境配置"}`;
}

export async function runDAStockEngine(
  input: Record<string, unknown>,
  options: { signal?: AbortSignal; onProgress?: (event: ResearchProgressEvent) => void } = {},
): Promise<EngineEvent> {
  options.signal?.throwIfAborted();
  const data = path.join(process.cwd(), "data/da-stock");
  mkdirSync(data, { recursive: true });
  const python = process.env.DA_STOCK_PYTHON || path.join(root(), ".venv/bin/python");
  const local = existsSync(python);
  const name = `stock-research-${crypto.randomUUID()}`;
  const env = engineEnvironment();
  env.DATABASE_PATH = local ? path.join(data, "chat.db") : "/runtime/chat.db";
  const args = local ? [path.join(root(), "bridge.py")] : [
    "run", "--rm", "-i", "--name", name,
    "--mount", `type=bind,source=${root()},target=/engine,readonly`,
    "--mount", `type=bind,source=${data},target=/runtime`,
    "--workdir", "/engine/upstream", "--entrypoint", "python",
    process.env.DA_STOCK_IMAGE || "stock-classification-research:local", "/engine/bridge.py",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(local ? python : "docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let terminal: EngineEvent | undefined;
    let failure: Error | undefined;
    const abort = () => {
      failure = options.signal?.aborted ? new DOMException("研究已停止", "AbortError") : new Error("问股引擎执行超时");
      child.kill("SIGTERM");
      if (!local) {
        const stop = spawn("docker", ["stop", "--time", "2", name], { stdio: "ignore" });
        stop.on("error", () => {});
      }
    };
    const timer = setTimeout(abort, input.operation === "catalog" ? 60_000 : 900_000);
    options.signal?.addEventListener("abort", abort, { once: true });
    // Provider diagnostics are not forwarded to clients or persisted with keys.
    child.stderr.resume();
    child.stdin.on("error", () => {});
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const event = JSON.parse(line) as EngineEvent;
        if (event.type === "done" || event.type === "error") terminal = event;
        else {
          const progress = mapEngineProgress(event);
          if (progress) options.onProgress?.(progress);
        }
      } catch { /* Non-protocol dependency output is never answer content. */ }
    });
    const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); };
    child.on("error", () => { cleanup(); reject(new Error("问股运行环境未就绪，请配置 DA_STOCK_PYTHON 或构建研究镜像")); });
    child.on("close", (code) => {
      cleanup();
      if (failure) reject(failure);
      else if (code !== 0 || !terminal || terminal.type === "error" || terminal.success === false) {
        reject(new Error(publicEngineError(terminal)));
      } else resolve(terminal);
    });
    child.stdin.end(JSON.stringify({ ...input, environment: env }) + "\n");
  });
}
