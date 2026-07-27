import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATABASE_FILE_PATTERN = /\.(?:sqlite|sqlite3|db)(?:-(?:wal|shm|journal))?$/i;
const SQLITE_SIDECAR_PATTERN = /-(?:wal|shm|journal)$/i;

export function isSensitiveDatabaseArtifact(relativePath) {
  const normalized = relativePath.replaceAll(path.sep, "/").replace(/^\.\/+/, "");
  const segments = normalized.toLowerCase().split("/").filter(Boolean);
  const filename = segments.at(-1) ?? "";
  return segments.slice(0, -1).includes("backups")
    || DATABASE_FILE_PATTERN.test(filename)
    || SQLITE_SIDECAR_PATTERN.test(filename);
}

export function findSensitiveDatabaseArtifacts(rootPath) {
  const resolvedRoot = path.resolve(rootPath);
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error(`发布产物目录不存在：${resolvedRoot}`);
  }
  if (!fs.statSync(resolvedRoot).isDirectory()) {
    throw new Error(`发布产物路径不是目录：${resolvedRoot}`);
  }

  const findings = [];
  const pending = [resolvedRoot];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(resolvedRoot, absolutePath);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
      } else if (isSensitiveDatabaseArtifact(relativePath)) {
        findings.push(relativePath.replaceAll(path.sep, "/"));
      }
    }
  }
  return findings.sort();
}

export function assertNoSensitiveDatabaseArtifacts(rootPath) {
  const resolvedRoot = path.resolve(rootPath);
  const findings = findSensitiveDatabaseArtifacts(resolvedRoot);
  if (findings.length > 0) {
    throw new Error(
      [
        `发布产物包含数据库或备份文件，已拒绝发布：${resolvedRoot}`,
        ...findings.map((finding) => `- ${finding}`),
        "请将运行数据库放在构建目录之外，并检查 Next.js outputFileTracingExcludes。",
      ].join("\n"),
    );
  }
  return { root: resolvedRoot, findings };
}

function readRootArgument(args) {
  const rootArgument = args.find((argument) => argument.startsWith("--root="));
  return path.resolve(rootArgument?.slice("--root=".length) || path.join(".next", "standalone"));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = assertNoSensitiveDatabaseArtifacts(readRootArgument(process.argv.slice(2)));
    process.stdout.write(`PASS 发布产物未包含数据库或备份文件：${result.root}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "发布产物检查失败"}\n`);
    process.exitCode = 1;
  }
}
