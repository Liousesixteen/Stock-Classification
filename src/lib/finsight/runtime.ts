import { spawn } from "node:child_process";
import { access, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ResearchReportType } from "@/lib/repositories/researchDocuments";
import { reportOutlineForType, type FinSightTargetType } from "@/lib/finsight/reportPlanner";
import { createReportProgress, type ReportGenerationProgress } from "@/lib/research/reportGenerationProgress";
import type { ResearchCitation } from "@/lib/research/researchEvidenceCatalog";
import { sanitizePublicReportText } from "@/lib/research/publicReportBrand";

const EVENT_PREFIX = "@@FINSIGHT_EVENT@@";

export type ResearchReportEngine = "native" | "finsight";

export type ResearchReportArtifact = {
  format: "markdown" | "docx" | "pdf";
  path: string;
  bytes: number;
  mediaType: string;
};

export type FinSightResult = {
  title: string;
  executiveSummary: string;
  markdown: string;
  model: string;
  citations: ResearchCitation[];
  artifacts: ResearchReportArtifact[];
};

type BridgeEvent =
  | { type: "progress"; event: Partial<ReportGenerationProgress> & Pick<ReportGenerationProgress, "phase" | "step" | "message"> }
  | { type: "result"; result: Omit<FinSightResult, "citations"> & { runDir: string } }
  | { type: "error"; error: string; errorType?: string };

export type FinSightRuntimeStatus = {
  available: boolean;
  serviceRoot: string;
  python: string;
  missing: string[];
  chartsEnabled: boolean;
};

export async function getFinSightRuntimeStatus(): Promise<FinSightRuntimeStatus> {
  const serviceRoot = finSightServiceRoot();
  const python = await resolvePython(serviceRoot);
  const chartsEnabled = envBoolean("REPORT_ENGINE_ENABLE_CHARTS", true, "FINSIGHT_ENABLE_CHARTS");
  const required = [
    ["主模型配置", Boolean(
      (process.env.REPORT_ENGINE_DS_MODEL_NAME || process.env.FINSIGHT_DS_MODEL_NAME || process.env.DS_MODEL_NAME || process.env.DEEPSEEK_MODEL)?.trim()
      && (process.env.REPORT_ENGINE_DS_API_KEY || process.env.FINSIGHT_DS_API_KEY || process.env.DS_API_KEY || process.env.DEEPSEEK_API_KEY)?.trim()
      && (process.env.REPORT_ENGINE_DS_BASE_URL || process.env.FINSIGHT_DS_BASE_URL || process.env.DS_BASE_URL || process.env.DEEPSEEK_BASE_URL)?.trim()
    )],
    ["Embedding 模型配置", Boolean(
      (process.env.REPORT_ENGINE_EMBEDDING_MODEL_NAME || process.env.FINSIGHT_EMBEDDING_MODEL_NAME || process.env.EMBEDDING_MODEL_NAME)?.trim()
      && (process.env.REPORT_ENGINE_EMBEDDING_API_KEY || process.env.FINSIGHT_EMBEDDING_API_KEY || process.env.EMBEDDING_API_KEY)?.trim()
      && (process.env.REPORT_ENGINE_EMBEDDING_BASE_URL || process.env.FINSIGHT_EMBEDDING_BASE_URL || process.env.EMBEDDING_BASE_URL)?.trim()
    )],
    ...(chartsEnabled ? [
      ["VLM 图表模型配置", Boolean(
        (process.env.REPORT_ENGINE_VLM_MODEL_NAME || process.env.FINSIGHT_VLM_MODEL_NAME || process.env.VLM_MODEL_NAME)?.trim()
        && (process.env.REPORT_ENGINE_VLM_API_KEY || process.env.FINSIGHT_VLM_API_KEY || process.env.VLM_API_KEY)?.trim()
        && (process.env.REPORT_ENGINE_VLM_BASE_URL || process.env.FINSIGHT_VLM_BASE_URL || process.env.VLM_BASE_URL)?.trim()
      )],
    ] : []),
  ] as Array<[string, boolean]>;
  const missing = required.filter(([, ready]) => !ready).map(([name]) => name);
  if (!python) missing.unshift("Python 3.10+ 与研报引擎虚拟环境");
  else {
    const pythonProbe = await probeCommand(python, ["-c", "import sys, yaml, openai, dill, json_repair, pandas, numpy; raise SystemExit(0 if sys.version_info >= (3, 10) else 2)"]);
    if (!pythonProbe) missing.unshift("Python 3.10+ 与研报引擎 Python 依赖");
  }
  try {
    await access(path.join(serviceRoot, "run_report.py"));
    await access(path.join(serviceRoot, "integration", "report_workshop_bridge.py"));
  } catch {
    missing.unshift("多智能体研报服务源码");
  }
  const pandoc = path.join(serviceRoot, ".tools", "bin", "pandoc");
  if (python && !(await probeCommand(pandoc, ["--version"], { ...process.env, FINSIGHT_PYTHON_BIN: python }))) {
    missing.push("Pandoc 文档渲染器");
  }
  return { available: missing.length === 0, serviceRoot, python: python || "", missing, chartsEnabled };
}

export async function runFinSightReport(
  input: {
    reportType: ResearchReportType;
    targetName: string;
    stockCode: string;
    focus: string;
    targetType: FinSightTargetType;
    onProgress?: (event: ReportGenerationProgress) => void;
    signal?: AbortSignal;
  },
): Promise<FinSightResult> {
  const status = await getFinSightRuntimeStatus();
  if (!status.available) {
    throw new Error(`星图多智能体研报引擎尚未就绪：${status.missing.join("、")}`);
  }
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const runsRoot = path.resolve(process.cwd(), (process.env.REPORT_ENGINE_RUNS_DIR || process.env.FINSIGHT_RUNS_DIR)?.trim() || "data/finsight-runs");
  const runDir = path.join(runsRoot, runId);
  await mkdir(runDir, { recursive: true });
  const requestPath = path.join(runDir, "bridge.request.json");
  await writeFile(requestPath, JSON.stringify({
    runDir,
    reportType: input.reportType,
    targetName: input.targetName,
    stockCode: input.stockCode,
    focus: input.focus,
    question: input.focus,
    targetType: input.targetType,
    resume: envBoolean("REPORT_ENGINE_RESUME", true, "FINSIGHT_RESUME"),
    maxConcurrent: envInteger("REPORT_ENGINE_MAX_CONCURRENT", 3, 1, 16, "FINSIGHT_MAX_CONCURRENT"),
    maxIterations: envInteger("REPORT_ENGINE_MAX_ITERATIONS", 20, 1, 100, "FINSIGHT_MAX_ITERATIONS"),
    generateTasks: envBoolean("REPORT_ENGINE_GENERATE_TASKS", true, "FINSIGHT_GENERATE_TASKS"),
    enableCharts: status.chartsEnabled,
    addReferences: envBoolean("REPORT_ENGINE_ADD_REFERENCES", true, "FINSIGHT_ADD_REFERENCES"),
    echo: envBoolean("REPORT_ENGINE_ECHO", false, "FINSIGHT_ECHO"),
  }, null, 2), "utf8");

  const bridgePath = path.join(status.serviceRoot, "integration", "report_workshop_bridge.py");
  return new Promise<FinSightResult>((resolve, reject) => {
    const child = spawn(status.python, [bridgePath, "--request", requestPath], {
      cwd: status.serviceRoot,
      env: {
        ...process.env,
        FINSIGHT_PYTHON_BIN: status.python,
        CRAWL4_AI_BASE_DIRECTORY: runDir,
        MPLCONFIGDIR: path.join(runDir, ".matplotlib"),
        XDG_CACHE_HOME: path.join(runDir, ".cache"),
        PATH: `${path.join(status.serviceRoot, ".tools", "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutBuffer = "";
    let stderrTail = "";
    let result: FinSightResult | null = null;
    let bridgeError = "";
    const abort = () => child.kill("SIGTERM");
    input.signal?.addEventListener("abort", abort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const marker = line.indexOf(EVENT_PREFIX);
        if (marker < 0) continue;
        try {
          const event = JSON.parse(line.slice(marker + EVENT_PREFIX.length)) as BridgeEvent;
          if (event.type === "progress") {
            input.onProgress?.(createReportProgress({
              phase: event.event.phase,
              step: event.event.step,
              totalSteps: 8,
              message: sanitizePublicReportText(event.event.message),
              detail: event.event.detail ? sanitizePublicReportText(event.event.detail) : undefined,
              reportType: input.reportType,
              sectionTitle: event.event.sectionTitle ? sanitizePublicReportText(event.event.sectionTitle) : undefined,
              completedSections: event.event.completedSections,
              totalSections: event.event.totalSections ?? reportOutlineForType(input.reportType).length,
              citationCount: event.event.citationCount,
            }));
          } else if (event.type === "result") {
            const normalized = normalizeFinSightMarkdown(event.result.markdown);
            result = {
              ...event.result,
              title: sanitizePublicReportText(event.result.title),
              executiveSummary: sanitizePublicReportText(event.result.executiveSummary),
              markdown: normalized.markdown,
              model: sanitizePublicReportText(event.result.model),
              citations: normalized.citations,
            };
          } else {
            bridgeError = sanitizePublicReportText(event.error);
          }
        } catch {
          // The embedded Python engine also logs to stdout; only structured events matter.
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderrTail = `${stderrTail}${chunk}`.slice(-8_000);
    });
    child.on("error", (error) => reject(new Error(`无法启动星图研报引擎：${sanitizePublicReportText(error.message)}`)));
    child.on("close", (code, signal) => {
      input.signal?.removeEventListener("abort", abort);
      if (input.signal?.aborted) return reject(new Error("研报生成任务已取消"));
      if (code !== 0 || !result) {
        const detail = sanitizePublicReportText(
          bridgeError || stderrTail.trim().split("\n").slice(-8).join("\n") || `进程退出码 ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`,
        );
        return reject(new Error(`星图研报生成失败：${detail}`));
      }
      resolve(result);
    });
  });
}

export async function readFinSightArtifact(
  artifact: ResearchReportArtifact,
): Promise<Uint8Array | null> {
  const runsRoot = path.resolve(process.cwd(), (process.env.REPORT_ENGINE_RUNS_DIR || process.env.FINSIGHT_RUNS_DIR)?.trim() || "data/finsight-runs");
  const resolved = path.resolve(artifact.path);
  if (!resolved.startsWith(`${runsRoot}${path.sep}`)) return null;
  try {
    const [realRunsRoot, realResolved] = await Promise.all([realpath(runsRoot), realpath(resolved)]);
    if (!realResolved.startsWith(`${realRunsRoot}${path.sep}`)) return null;
    const metadata = await stat(realResolved);
    if (!metadata.isFile() || metadata.size <= 0) return null;
    return await readFile(realResolved);
  } catch {
    return null;
  }
}

export function normalizeFinSightMarkdown(markdown: string): { markdown: string; citations: ResearchCitation[] } {
  const publicMarkdown = sanitizePublicReportText(markdown);
  const referenceHeading = publicMarkdown.search(/^##\s+(?:Reference Data Sources|参考(?:资料|数据来源|文献)|引用资料)\s*$/im);
  const referenceText = referenceHeading >= 0 ? publicMarkdown.slice(referenceHeading) : "";
  const citations: ResearchCitation[] = [];
  const referencePattern = /^\s*(\d+)[.)]\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = referencePattern.exec(referenceText))) {
    const index = match[1];
    const content = match[2].trim();
    const url = content.match(/https?:\/\/[^\s)\]}]+/)?.[0] ?? "";
    const date = content.match(/\b(20\d{2}[-/.]\d{1,2}(?:[-/.]\d{1,2})?)\b/)?.[1]?.replace(/[/.]/g, "-") ?? "";
    citations.push({
      id: `atlas-research:${index}`,
      title: content.replace(url, "").trim().slice(0, 180) || `研究来源 ${index}`,
      sourceType: inferSourceType(content),
      sourceDate: date,
      url,
      excerpt: content.slice(0, 800),
      credibility: /公告|年报|年度报告|财报|政府|交易所|统计局|协会/.test(content) ? "高" : "中",
    });
  }
  const citationIds = new Set(citations.map((citation) => citation.id));
  const normalized = publicMarkdown.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (token, indexes: string) => {
    const replacements = indexes.split(",").map((value) => `atlas-research:${value.trim()}`).filter((id) => citationIds.has(id));
    return replacements.length ? replacements.map((id) => `[${id}]`).join(" ") : token;
  });
  return { markdown: normalized, citations };
}

function finSightServiceRoot() {
  return path.resolve(process.cwd(), (process.env.REPORT_ENGINE_SERVICE_ROOT || process.env.FINSIGHT_SERVICE_ROOT)?.trim() || "services/finsight");
}

async function resolvePython(serviceRoot: string) {
  const configured = (process.env.REPORT_ENGINE_PYTHON_BIN || process.env.FINSIGHT_PYTHON_BIN)?.trim();
  if (configured) {
    if (!configured.includes(path.sep)) return configured;
    const resolved = path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
    try {
      await access(resolved);
      return resolved;
    } catch {
      return "";
    }
  }
  const bundled = path.join(serviceRoot, ".venv", "bin", "python");
  try {
    await access(bundled);
    return bundled;
  } catch {
    return "python3";
  }
}

function inferSourceType(content: string) {
  if (/公告|年报|年度报告|财报|招股|交易所/.test(content)) return "公司公告/财报";
  if (/政府|政策|统计局|监管/.test(content)) return "政策/官方统计";
  if (/研报|证券|券商/.test(content)) return "券商研报";
  if (/协会|行业|白皮书/.test(content)) return "行业/协会报告";
  return "深度研究网络资料";
}

function envBoolean(name: string, fallback: boolean, legacyName?: string) {
  const value = (process.env[name] || (legacyName ? process.env[legacyName] : undefined))?.trim().toLowerCase();
  if (!value) return fallback;
  return value !== "false" && value !== "0" && value !== "no";
}

function envInteger(name: string, fallback: number, min: number, max: number, legacyName?: string) {
  const value = Number(process.env[name] || (legacyName ? process.env[legacyName] : undefined));
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function probeCommand(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const child = spawn(command, args, { env, stdio: "ignore" });
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(false);
    }, 8_000);
    child.once("error", () => finish(false));
    child.once("close", (code) => finish(code === 0));
  });
}
