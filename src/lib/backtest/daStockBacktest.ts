import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export type BacktestOperation = "run" | "results" | "performance" | "strategy" | "wave";

export async function executeBacktest(operation: BacktestOperation, input: Record<string, unknown>) {
  const serviceRoot = path.join(process.cwd(), "services", "da-stock");
  const configuredPython = process.env.DA_STOCK_PYTHON;
  const python = configuredPython
    ? (path.isAbsolute(configuredPython) ? configuredPython : path.resolve(process.cwd(), configuredPython))
    : path.join(serviceRoot, ".venv", "bin", "python");
  if (!existsSync(python)) throw new Error("回测运行环境未安装，请执行 npm run backtest:setup");
  const dataDirectory = path.join(process.cwd(), "data", "da-stock");
  mkdirSync(dataDirectory, { recursive: true });
  const configuredDatabase = process.env.DA_STOCK_BACKTEST_DB;
  const databasePath = configuredDatabase
    ? (path.isAbsolute(configuredDatabase) ? configuredDatabase : path.resolve(process.cwd(), configuredDatabase))
    : path.join(dataDirectory, "stock_analysis.db");

  return new Promise<unknown>((resolve, reject) => {
    const child = spawn(python, [path.join(serviceRoot, "backtest_bridge.py")], {
      cwd: serviceRoot,
      env: { ...process.env, DATABASE_PATH: databasePath, PYTHONUNBUFFERED: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.resume();
    const timer = setTimeout(() => child.kill("SIGTERM"), operation === "run" ? 300_000 : 45_000);
    child.on("error", () => { clearTimeout(timer); reject(new Error("回测引擎无法启动")); });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const line = stdout.trim().split("\n").at(-1);
        const result = JSON.parse(line || "{}") as { ok?: boolean; data?: unknown; error?: string };
        if (code === 0 && result.ok) resolve(result.data);
        else reject(new Error(result.error || "DA-Stock 回测执行失败"));
      } catch { reject(new Error("DA-Stock 回测返回格式异常")); }
    });
    child.stdin.end(JSON.stringify({ operation, ...input }) + "\n");
  });
}
