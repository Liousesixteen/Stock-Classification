import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const extraArgs = process.argv.slice(2);
const databasePath = process.env.STOCK_CLASSIFICATION_DB_PATH || path.join(
  workspaceRoot,
  "data",
  "stock-classification.sqlite",
);
const standaloneServerPath = path.join(workspaceRoot, ".next", "standalone", "server.js");
const containerServerPath = path.join(workspaceRoot, "server.js");
const serverPath = fs.existsSync(standaloneServerPath) ? standaloneServerPath : containerServerPath;
const runtimeEnv = {
  ...process.env,
  STOCK_CLASSIFICATION_DB_PATH: databasePath,
  // Next's generated standalone server changes cwd to .next/standalone. Keep
  // Keep the local strategy runtime and database anchored to the real workspace.
  DA_STOCK_PYTHON: process.env.STRATEGY_ENGINE_PYTHON || process.env.DA_STOCK_PYTHON || path.join(
    workspaceRoot,
    "services",
    "da-stock",
    ".venv",
    "bin",
    "python",
  ),
  DA_STOCK_BACKTEST_DB: process.env.STRATEGY_ENGINE_BACKTEST_DB || process.env.DA_STOCK_BACKTEST_DB || path.join(
    workspaceRoot,
    "data",
    "da-stock",
    "stock_analysis.db",
  ),
};
const portIndex = extraArgs.findIndex((arg) => arg === "--port" || arg === "-p");
if (portIndex >= 0 && extraArgs[portIndex + 1]) runtimeEnv.PORT = extraArgs[portIndex + 1];
const hostnameIndex = extraArgs.findIndex((arg) => arg === "--hostname" || arg === "-H");
if (hostnameIndex >= 0 && extraArgs[hostnameIndex + 1]) runtimeEnv.HOSTNAME = extraArgs[hostnameIndex + 1];

// Run the generated artifact as an isolated child process (the deployment shape
// recommended by Next) while preserving the workspace database path. Keeping the
// wrapper as the signal owner also makes repeated local starts easier to stop cleanly.
const child = spawn(process.execPath, [serverPath], {
  cwd: workspaceRoot,
  env: runtimeEnv,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
