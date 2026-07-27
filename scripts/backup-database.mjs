import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve(process.env.STOCK_CLASSIFICATION_DB_PATH || path.join(process.cwd(), "data", "stock-classification.sqlite"));
const backupDir = path.resolve(process.env.STOCK_BACKUP_DIR || path.join(process.cwd(), "backups"));
if (!fs.existsSync(sourcePath)) throw new Error(`数据库不存在：${sourcePath}`);

fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.join(backupDir, `stock-classification-${stamp}.sqlite`);
const partial = `${destination}.partial`;
const source = new Database(sourcePath, { readonly: true, fileMustExist: true });

try {
  assertHealthy(source, "源数据库");
  await source.backup(partial);
  const backup = new Database(partial, { readonly: true, fileMustExist: true });
  try {
    assertHealthy(backup, "备份数据库");
  } finally {
    backup.close();
  }
  fs.chmodSync(partial, 0o600);
  fs.renameSync(partial, destination);
  const digest = createHash("sha256").update(fs.readFileSync(destination)).digest("hex");
  fs.writeFileSync(`${destination}.sha256`, `${digest}  ${path.basename(destination)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    status: "ok",
    source: sourcePath,
    backup: destination,
    bytes: fs.statSync(destination).size,
    sha256: digest,
  }, null, 2)}\n`);
} finally {
  source.close();
  if (fs.existsSync(partial)) fs.rmSync(partial);
}

function assertHealthy(db, label) {
  const result = db.pragma("quick_check", { simple: true });
  if (result !== "ok") throw new Error(`${label}完整性检查失败：${result}`);
}
