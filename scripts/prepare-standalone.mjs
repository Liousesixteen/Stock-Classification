import fs from "node:fs";
import path from "node:path";
import { assertNoSensitiveDatabaseArtifacts, isSensitiveDatabaseArtifact } from "./check-release-artifacts.mjs";

const root = process.cwd();
const standaloneRoot = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(standaloneRoot, "server.js"))) {
  throw new Error("standalone 构建产物不存在，请先执行 npm run build");
}

copyDirectory(path.join(root, ".next", "static"), path.join(standaloneRoot, ".next", "static"), true);
copyDirectory(path.join(root, "public"), path.join(standaloneRoot, "public"), false);
copyDirectory(path.join(root, "services", "finsight"), path.join(standaloneRoot, "services", "finsight"), true);
copyDAStock(path.join(root, "services", "da-stock"), path.join(standaloneRoot, "services", "da-stock"));
copyRichWorkbench(
  path.join(root, "services", "rich-workbench"),
  path.join(standaloneRoot, "services", "rich-workbench"),
);
assertNoSensitiveDatabaseArtifacts(standaloneRoot);
process.stdout.write(`PASS standalone 发布产物数据库防泄漏检查：${standaloneRoot}\n`);

function copyDirectory(source, destination, required) {
  if (!fs.existsSync(source)) {
    if (required) throw new Error(`构建资源不存在：${source}`);
    return;
  }
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
}

function copyRichWorkbench(source, destination) {
  if (!fs.existsSync(source)) throw new Error(`构建资源不存在：${source}`);
  const excludedDirectories = new Set(["private", ".runtime", "rich-state", "releases", "__pycache__"]);
  const excludedFiles = new Set([".dash_state.json", ".DS_Store"]);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, {
    recursive: true,
    filter(entry) {
      const relative = path.relative(source, entry);
      if (!relative) return true;
      const segments = relative.split(path.sep);
      return !segments.some((segment) => excludedDirectories.has(segment))
        && !excludedFiles.has(path.basename(entry))
        && !entry.endsWith(".log");
    },
  });
}

function copyDAStock(source, destination) {
  if (!fs.existsSync(source)) throw new Error(`构建资源不存在：${source}`);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, {
    recursive: true,
    filter(entry) {
      const relative = path.relative(source, entry);
      if (!relative) return true;
      return !relative.split(path.sep).some((segment) => segment === ".venv" || segment === "__pycache__")
        && !entry.endsWith(".pyc")
        && !isSensitiveDatabaseArtifact(relative)
        && path.basename(entry) !== ".env";
    },
  });
}
