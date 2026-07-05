import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "./schema";
import { seedSemiconductorData } from "./seed";

const appDbs = new Map<string, Database.Database>();

export function getDatabase(dbPath = path.join(process.cwd(), "data", "stock-classification.sqlite")) {
  const resolvedPath = path.resolve(dbPath);
  const cachedDb = appDbs.get(resolvedPath);
  if (cachedDb) return cachedDb;

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const db = new Database(resolvedPath);
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedSemiconductorData(db);
  appDbs.set(resolvedPath, db);
  return db;
}
