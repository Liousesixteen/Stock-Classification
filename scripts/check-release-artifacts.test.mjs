import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertNoSensitiveDatabaseArtifacts,
  findSensitiveDatabaseArtifacts,
  isSensitiveDatabaseArtifact,
} from "./check-release-artifacts.mjs";

const scriptPath = fileURLToPath(new URL("./check-release-artifacts.mjs", import.meta.url));

test("recognizes databases, SQLite sidecars, and backup contents", () => {
  assert.equal(isSensitiveDatabaseArtifact("data/runtime.sqlite"), true);
  assert.equal(isSensitiveDatabaseArtifact("nested/runtime.sqlite3-shm"), true);
  assert.equal(isSensitiveDatabaseArtifact("nested/runtime.db-wal"), true);
  assert.equal(isSensitiveDatabaseArtifact("backups/daily.snapshot"), true);
  assert.equal(isSensitiveDatabaseArtifact("server.js"), false);
});

test("accepts a clean artifact and rejects sensitive files without deleting them", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stock-release-artifacts-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.mkdirSync(path.join(root, "backups"), { recursive: true });
  fs.writeFileSync(path.join(root, "server.js"), "export {};\n");

  assert.deepEqual(findSensitiveDatabaseArtifacts(root), []);
  assert.doesNotThrow(() => assertNoSensitiveDatabaseArtifacts(root));

  const databasePath = path.join(root, "data", "runtime.sqlite");
  const backupPath = path.join(root, "backups", "daily.snapshot");
  fs.writeFileSync(databasePath, "runtime database sentinel");
  fs.writeFileSync(backupPath, "backup sentinel");

  assert.deepEqual(findSensitiveDatabaseArtifacts(root), [
    "backups/daily.snapshot",
    "data/runtime.sqlite",
  ]);
  assert.throws(() => assertNoSensitiveDatabaseArtifacts(root), /已拒绝发布/);
  assert.equal(fs.readFileSync(databasePath, "utf8"), "runtime database sentinel");
  assert.equal(fs.readFileSync(backupPath, "utf8"), "backup sentinel");
});

test("CLI exits non-zero for a contaminated artifact", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stock-release-cli-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "server.js"), "export {};\n");

  const clean = spawnSync(process.execPath, [scriptPath, `--root=${root}`], { encoding: "utf8" });
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /PASS/);

  fs.writeFileSync(path.join(root, "workspace.db"), "database sentinel");
  const contaminated = spawnSync(process.execPath, [scriptPath, `--root=${root}`], { encoding: "utf8" });
  assert.equal(contaminated.status, 1);
  assert.match(contaminated.stderr, /workspace\.db/);
  assert.equal(fs.existsSync(path.join(root, "workspace.db")), true);
});
