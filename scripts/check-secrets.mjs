import { execFileSync } from "node:child_process";
import fs from "node:fs";

const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
).split("\0").filter(Boolean);
const patterns = [
  { label: "API key token", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];
const allowedEmptyExamples = new Set(["DEEPSEEK_API_KEY=", "STOCK_APP_BASIC_AUTH_PASSWORD=", "STOCK_OPERATIONS_TOKEN="]);
const findings = [];

for (const file of tracked) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
  const content = fs.readFileSync(file, "utf8");
  for (const { label, pattern } of patterns) {
    for (const match of content.matchAll(pattern)) {
      const value = match[0].trim();
      if (allowedEmptyExamples.has(value)) continue;
      const line = content.slice(0, match.index).split("\n").length;
      findings.push({ file, line, label });
    }
  }
  if (/(^|\/)\.env(?:\.|$)/.test(file)) {
    const assignmentPattern = /(?:API_KEY|SECRET|PASSWORD|OPERATIONS_TOKEN)[ \t]*=[ \t]*["']?[^"'#\s][^"'\r\n]*/gi;
    for (const match of content.matchAll(assignmentPattern)) {
      const value = match[0].trim();
      if (allowedEmptyExamples.has(value)) continue;
      const line = content.slice(0, match.index).split("\n").length;
      findings.push({ file, line, label: "non-empty secret assignment" });
    }
  }
}

if (findings.length) {
  process.stderr.write(`发现疑似密钥，已隐藏原文：\n${findings.map((item) => `- ${item.file}:${item.line} ${item.label}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`安全扫描通过：检查 ${tracked.length} 个 Git 跟踪或待纳入文件，未发现疑似密钥。\n`);
}
