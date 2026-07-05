import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "./schema";
import { seedSemiconductorData } from "./seed";

let appDb: Database.Database | null = null;

export function getDatabase(dbPath = path.join(process.cwd(), "data", "stock-classification.sqlite")) {
  if (appDb) return appDb;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  appDb = new Database(dbPath);
  appDb.pragma("foreign_keys = ON");
  migrate(appDb);
  seedSemiconductorData(appDb);
  return appDb;
}
