import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneRoot = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(standaloneRoot, "server.js"))) {
  throw new Error("standalone 构建产物不存在，请先执行 npm run build");
}

copyDirectory(path.join(root, ".next", "static"), path.join(standaloneRoot, ".next", "static"), true);
copyDirectory(path.join(root, "public"), path.join(standaloneRoot, "public"), false);

function copyDirectory(source, destination, required) {
  if (!fs.existsSync(source)) {
    if (required) throw new Error(`构建资源不存在：${source}`);
    return;
  }
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
}
