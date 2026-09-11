import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const candidates = [
  process.env.A_STOCK_PYTHON,
  path.join(homedir(), "DevProjs", "a-stock-investment", ".venv", "bin", "python"),
  "python3",
].filter(Boolean);
const python = candidates.find((candidate) => candidate === "python3" || existsSync(candidate));
if (!python) throw new Error("未找到可用的 Python 运行环境");

const result = spawnSync(python, [path.join(process.cwd(), "scripts", "sync-a-share-universe.py"), ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
