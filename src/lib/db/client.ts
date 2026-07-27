import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "./schema";
import { seedSemiconductorData } from "./seed";

const appDbs = new Map<string, Database.Database>();

export function getDatabase(dbPath = process.env.STOCK_CLASSIFICATION_DB_PATH ?? path.join(process.cwd(), "data", "stock-classification.sqlite")) {
  const resolvedPath = path.resolve(dbPath);
  const cachedDb = appDbs.get(resolvedPath);
  if (cachedDb) return cachedDb;

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const db = new Database(resolvedPath);
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    migrate(db);
    seedSemiconductorData(db);
    enforcePrivatePermissions(resolvedPath);
  } catch (error) {
    db.close();
    throw error;
  }
  appDbs.set(resolvedPath, db);
  return db;
}

function enforcePrivatePermissions(dbPath: string) {
  if (process.env.STOCK_DB_ENFORCE_PRIVATE_PERMISSIONS === "false") return;
  for (const candidate of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (!fs.existsSync(candidate)) continue;
    try {
      fs.chmodSync(candidate, 0o600);
    } catch {
      // Some mounted filesystems do not support POSIX permission changes.
    }
  }
}
