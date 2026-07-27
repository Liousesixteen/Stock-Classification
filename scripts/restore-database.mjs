import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const fromArg = process.argv.find((argument) => argument.startsWith("--from="));
const confirmed = process.argv.includes("--confirm");
if (!fromArg || !confirmed) {
  throw new Error("恢复需要显式确认：npm run db:restore -- --from=/absolute/backup.sqlite --confirm");
}

const sourcePath = path.resolve(fromArg.slice("--from=".length));
const targetPath = path.resolve(process.env.STOCK_CLASSIFICATION_DB_PATH || path.join(process.cwd(), "data", "stock-classification.sqlite"));
if (!fs.existsSync(sourcePath)) throw new Error(`备份文件不存在：${sourcePath}`);
if (sourcePath === targetPath) throw new Error("备份文件不能与当前数据库相同");
verifyChecksumIfPresent(sourcePath);

const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
try {
  assertHealthy(source, "待恢复备份");
} finally {
  source.close();
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const rollbackPath = `${targetPath}.pre-restore-${stamp}.sqlite`;
const partialPath = `${targetPath}.restore-partial`;

if (fs.existsSync(targetPath)) {
  const current = new Database(targetPath, { readonly: true, fileMustExist: true });
  try {
    assertHealthy(current, "当前数据库");
    await current.backup(rollbackPath);
  } finally {
    current.close();
  }
  fs.chmodSync(rollbackPath, 0o600);
  const rollback = new Database(rollbackPath, { readonly: true, fileMustExist: true });
  try {
    assertHealthy(rollback, "恢复前回滚备份");
  } finally {
    rollback.close();
  }
}

fs.copyFileSync(sourcePath, partialPath);
fs.chmodSync(partialPath, 0o600);
const copied = new Database(partialPath, { readonly: true, fileMustExist: true });
try {
  assertHealthy(copied, "恢复副本");
} finally {
  copied.close();
}
fs.renameSync(partialPath, targetPath);
for (const suffix of ["-wal", "-shm"]) {
  const sidecar = `${targetPath}${suffix}`;
  if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
}

process.stdout.write(`${JSON.stringify({
  status: "restored",
  restoredFrom: sourcePath,
  database: targetPath,
  rollbackBackup: fs.existsSync(rollbackPath) ? rollbackPath : null,
}, null, 2)}\n`);

function assertHealthy(db, label) {
  const result = db.pragma("quick_check", { simple: true });
  if (result !== "ok") throw new Error(`${label}完整性检查失败：${result}`);
}

function verifyChecksumIfPresent(databasePath) {
  const checksumPath = `${databasePath}.sha256`;
  if (!fs.existsSync(checksumPath)) return;
  const expected = fs.readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(fs.readFileSync(databasePath)).digest("hex");
  if (!expected || expected !== actual) throw new Error("备份 SHA-256 校验失败");
}
