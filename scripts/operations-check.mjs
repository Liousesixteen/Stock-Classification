import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const databasePath = path.resolve(process.env.STOCK_CLASSIFICATION_DB_PATH || path.join(process.cwd(), "data", "stock-classification.sqlite"));
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

add("Node.js 24", process.versions.node.startsWith("24."), process.versions.node);
add("DeepSeek key outside production", process.env.NODE_ENV !== "production" || Boolean(process.env.DEEPSEEK_API_KEY), process.env.DEEPSEEK_API_KEY ? "configured" : "not configured");
add("Production access control", process.env.NODE_ENV !== "production" || Boolean(process.env.STOCK_APP_BASIC_AUTH_USER && process.env.STOCK_APP_BASIC_AUTH_PASSWORD), process.env.NODE_ENV === "production" ? "required" : "development");
add("Operations token", process.env.NODE_ENV !== "production" || Boolean(process.env.STOCK_OPERATIONS_TOKEN), process.env.STOCK_OPERATIONS_TOKEN ? "configured" : "not configured");

if (fs.existsSync(databasePath)) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    add("SQLite integrity", db.pragma("quick_check", { simple: true }) === "ok", databasePath);
  } finally {
    db.close();
  }
  const mode = fs.statSync(databasePath).mode & 0o777;
  add("SQLite private permissions", (mode & 0o077) === 0, `0${mode.toString(8)}`);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${databasePath}${suffix}`;
    if (!fs.existsSync(sidecar)) continue;
    const sidecarMode = fs.statSync(sidecar).mode & 0o777;
    add(`SQLite ${suffix.slice(1).toUpperCase()} permissions`, (sidecarMode & 0o077) === 0, `0${sidecarMode.toString(8)}`);
  }
} else {
  add("SQLite database", process.env.NODE_ENV !== "production", `not created: ${databasePath}`);
}

for (const check of checks) process.stdout.write(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}\n`);
if (checks.some((check) => !check.ok)) process.exitCode = 1;
