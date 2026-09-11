import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (!new Set(["dev", "start"]).has(mode)) {
  throw new Error("用法：node scripts/run-workbench.mjs dev|start");
}
const nextExtraArgs = process.argv.slice(3);

const root = process.cwd();
// The integrated market service shares the main process lifecycle.
const python = process.env.RICH_WORKBENCH_PYTHON_BIN || "python3";
const richPort = Number(process.env.RICH_WORKBENCH_PORT || 8765);
const richHost = process.env.RICH_WORKBENCH_HOST || "127.0.0.1";
const richServer = path.join(root, "services", "rich-workbench", "server.py");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const healthUrl = `http://127.0.0.1:${richPort}/api/health`;

let richProcess = null;
let appProcess = null;
let stopping = false;

if (!(await richIsHealthy())) {
    richProcess = spawn(python, [richServer], {
      cwd: path.dirname(richServer),
      env: {
        ...process.env,
        RICH_WORKBENCH_HOST: richHost,
        RICH_WORKBENCH_PORT: String(richPort),
        RICH_TRUST_LOOPBACK_PROXY: new Set(["127.0.0.1", "::1", "localhost"]).has(richHost) ? "true" : "false",
      },
      stdio: "inherit",
    });
    richProcess.on("error", fail);
    await waitForRich();
} else {
  process.stdout.write(`Yidianx 市场服务已在 ${healthUrl} 运行，将直接复用。\n`);
}

const appArgs = mode === "dev"
  ? [nextBin, "dev", ...nextExtraArgs]
  : [fileURLToPath(new URL("./start-standalone.mjs", import.meta.url)), ...nextExtraArgs];
appProcess = spawn(process.execPath, appArgs, {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
appProcess.on("error", fail);
appProcess.on("exit", (code, signal) => shutdown(signal || (code === 0 ? "SIGTERM" : "SIGINT"), code ?? 1));

if (richProcess) {
  richProcess.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(`Yidianx 市场服务意外退出（${signal || code}），正在关闭主项目。`);
      shutdown("SIGTERM", code ?? 1);
    }
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(signal, 0));
}

async function richIsHealthy() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.alive === true;
  } catch {
    return false;
  }
}

async function waitForRich() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await richIsHealthy()) {
      process.stdout.write(`Yidianx 市场服务已就绪：${healthUrl}\n`);
      return;
    }
    if (richProcess?.exitCode != null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  richProcess?.kill("SIGTERM");
  throw new Error(`Yidianx 市场服务未能在端口 ${richPort} 启动，请检查 Python 与端口占用。`);
}

function fail(error) {
  console.error(error);
  shutdown("SIGTERM", 1);
}

function shutdown(signal, exitCode) {
  if (stopping) return;
  stopping = true;
  if (appProcess && appProcess.exitCode == null) appProcess.kill(signal);
  if (richProcess && richProcess.exitCode == null) richProcess.kill(signal);
  process.exitCode = exitCode;
}
