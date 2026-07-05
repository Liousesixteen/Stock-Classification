import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDatabase } from "@/lib/db/client";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";

describe("database schema", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("creates and seeds the semiconductor category tree", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    seedSemiconductorData(db);

    const requiredNames = [
      "半导体",
      "材料",
      "光刻材料",
      "光刻胶",
      "ArF 干法/浸没式光刻胶",
      "KrF 光刻胶",
      "EUV 光刻胶",
      "EDA/IP",
      "设计",
      "制造",
      "封测",
    ];

    const rows = db
      .prepare(`select name from categories where name in (${requiredNames.map(() => "?").join(", ")})`)
      .all(...requiredNames) as Array<{ name: string }>;

    expect(rows.map((row) => row.name).sort()).toEqual([...requiredNames].sort());

    const branchPath = db
      .prepare(
        `
          select ar.name
          from categories root
          join categories material on material.parent_id = root.id
          join categories lithography on lithography.parent_id = material.id
          join categories resist on resist.parent_id = lithography.id
          join categories ar on ar.parent_id = resist.id
          where root.name = ?
            and root.parent_id is null
            and material.name = ?
            and lithography.name = ?
            and resist.name = ?
            and ar.name = ?
        `,
      )
      .get("半导体", "材料", "光刻材料", "光刻胶", "ArF 干法/浸没式光刻胶") as
      | { name: string }
      | undefined;

    expect(branchPath?.name).toBe("ArF 干法/浸没式光刻胶");
  });

  it("seeds additively and does not duplicate categories", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);

    db.prepare("insert into categories (name, parent_id, level, sort_order) values (?, null, ?, ?)").run(
      "半导体",
      0,
      0,
    );

    seedSemiconductorData(db);
    const firstCount = db.prepare("select count(*) as count from categories").get() as { count: number };

    seedSemiconductorData(db);
    const secondCount = db.prepare("select count(*) as count from categories").get() as { count: number };

    const krf = db.prepare("select name from categories where name = ?").get("KrF 光刻胶") as
      | { name: string }
      | undefined;

    expect(krf?.name).toBe("KrF 光刻胶");
    expect(secondCount.count).toBe(firstCount.count);
  });

  it("seeds the sample company", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    seedSemiconductorData(db);

    const company = db.prepare("select short_name from companies where stock_code = ?").get("300346") as
      | { short_name: string }
      | undefined;

    expect(company?.short_name).toBe("南大光电");
  });

  it("prevents duplicate root categories", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    seedSemiconductorData(db);

    expect(() => {
      db.prepare("insert into categories (name, parent_id, level, sort_order) values (?, null, ?, ?)").run(
        "半导体",
        0,
        0,
      );
    }).toThrow();
  });

  it("enforces primary evidence foreign keys", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    seedSemiconductorData(db);

    const category = db.prepare("select id from categories where name = ?").get("ArF 干法/浸没式光刻胶") as {
      id: number;
    };

    expect(() => {
      db.prepare(
        `
          insert into company_category_relations (
            stock_code,
            category_id,
            relation_type,
            confidence,
            primary_evidence_id
          )
          values (?, ?, ?, ?, ?)
        `,
      ).run("300346", category.id, "material", "高", 999);
    }).toThrow();
  });

  it("caches database clients by resolved path", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stock-classification-db-"));
    tempDirs.push(tempDir);

    const firstPath = path.join(tempDir, "first.sqlite");
    const secondPath = path.join(tempDir, "second.sqlite");

    const firstDb = getDatabase(firstPath);
    const firstDbAgain = getDatabase(firstPath);
    const secondDb = getDatabase(secondPath);

    expect(firstDbAgain).toBe(firstDb);
    expect(secondDb).not.toBe(firstDb);
    expect(fs.existsSync(firstPath)).toBe(true);
    expect(fs.existsSync(secondPath)).toBe(true);
  });
});
