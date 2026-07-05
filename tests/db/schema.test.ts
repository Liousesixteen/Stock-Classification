import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";

describe("database schema", () => {
  it("creates and seeds semiconductor categories", () => {
    const db = new Database(":memory:");
    migrate(db);
    seedSemiconductorData(db);

    const row = db
      .prepare("select name from categories where name = ?")
      .get("ArF 干法/浸没式光刻胶") as { name: string } | undefined;

    expect(row?.name).toBe("ArF 干法/浸没式光刻胶");
  });
});
