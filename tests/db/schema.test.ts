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

  it("upgrades the original five-table database without losing user data", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      create table categories (
        id integer primary key autoincrement,
        name text not null,
        parent_id integer references categories(id),
        level integer not null,
        sort_order integer not null default 0,
        aliases text not null default '[]',
        description text not null default '',
        industry text not null default '',
        is_active integer not null default 1,
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp,
        unique(name, parent_id)
      );
      create table companies (
        stock_code text primary key,
        short_name text not null,
        full_name text not null default '',
        board text not null default '',
        industry text not null default '',
        region text not null default '',
        market_cap_band text not null default '',
        intro text not null default '',
        main_business text not null default '',
        updated_at text not null default current_timestamp
      );
      create table company_category_relations (
        id integer primary key autoincrement,
        stock_code text not null references companies(stock_code) on delete cascade,
        category_id integer not null references categories(id) on delete cascade,
        relation_type text not null,
        confidence text not null,
        rationale text not null default '',
        primary_evidence_id integer references evidences(id) on delete set null,
        is_watchlist integer not null default 0,
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp,
        unique(stock_code, category_id)
      );
      create table evidences (
        id integer primary key autoincrement,
        relation_id integer not null references company_category_relations(id) on delete cascade,
        source_type text not null,
        title text not null,
        source_date text not null default '',
        url text not null default '',
        excerpt text not null default '',
        credibility text not null default '中',
        is_expired integer not null default 0,
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      );
      create table research_notes (
        id integer primary key autoincrement,
        target_type text not null,
        target_id text not null,
        note_type text not null,
        content text not null,
        tags text not null default '[]',
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      );
    `);
    db.prepare("insert into categories (id, name, level) values (91, '用户产业链', 0)").run();
    db.prepare("insert into companies (stock_code, short_name, main_business) values ('600000', '迁移样本', '保留的主营业务')").run();
    db.prepare(`
      insert into company_category_relations (id, stock_code, category_id, relation_type, confidence, rationale)
      values (92, '600000', 91, '主营业务', '中', '保留的关系判断')
    `).run();
    db.prepare(`
      insert into evidences (id, relation_id, source_type, title, source_date, url)
      values (93, 92, '公告', '保留的证据', '2025-01-01', 'https://example.com/legacy')
    `).run();
    db.prepare("update company_category_relations set primary_evidence_id = 93 where id = 92").run();
    db.prepare(`
      insert into research_notes (target_type, target_id, note_type, content)
      values ('company', '600000', '我的备注', '不能丢失的用户备注')
    `).run();

    migrate(db);
    migrate(db);

    expect(db.prepare("select main_business from companies where stock_code = '600000'").get()).toEqual({
      main_business: "保留的主营业务",
    });
    expect(db.prepare("select title from evidences where id = 93").get()).toEqual({ title: "保留的证据" });
    expect(db.prepare("select content from research_notes where target_id = '600000'").get()).toEqual({
      content: "不能丢失的用户备注",
    });
    const relation = db.prepare(`
      select direction, strength, verification_status as verificationStatus
      from company_category_relations where id = 92
    `).get();
    expect(relation).toEqual({ direction: "undirected", strength: 50, verificationStatus: "unverified" });
    expect(db.prepare("select count(*) as count from operation_audit_events").get()).toEqual({ count: 0 });
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

  it("creates persistent research tasks and artifact state tables", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);

    const tables = db.prepare(`
      select name from sqlite_master
      where type = 'table' and name in ('research_tasks', 'research_artifact_states')
      order by name
    `).all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toEqual(["research_artifact_states", "research_tasks"]);

    const relationColumns = db.prepare("pragma table_info(company_category_relations)").all() as Array<{ name: string }>;
    expect(relationColumns.map((column) => column.name)).toEqual(expect.arrayContaining(["verification_status", "verified_at"]));
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

  it("adds durable queue columns to an existing sync_tasks table", () => {
    const db = new Database(":memory:");
    db.exec(`
      create table sync_tasks (
        id integer primary key autoincrement,
        stock_code text not null,
        task_type text not null,
        source text not null default '',
        status text not null,
        message text not null default '',
        error text not null default '',
        started_at text not null default '',
        finished_at text not null default '',
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      );
    `);

    migrate(db);
    const columns = db.prepare("pragma table_info(sync_tasks)").all() as Array<{ name: string }>;

    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "progress",
        "attempt_count",
        "max_attempts",
        "next_attempt_at",
        "lease_expires_at",
        "idempotency_key",
        "payload_json",
      ]),
    );
  });

  it("stores graph direction, strength, and observation time on both relation tables", () => {
    const db = new Database(":memory:");
    migrate(db);

    for (const table of ["company_category_relations", "company_graph_entity_relations"]) {
      const columns = db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
      expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining(["direction", "strength", "observed_at"]));
    }
  });

  it("creates a durable store for industry and open-question research", () => {
    const db = new Database(":memory:");
    migrate(db);
    const table = db.prepare("select name from sqlite_master where type = 'table' and name = 'universal_research_runs'").get();
    const columns = db.prepare("pragma table_info(universal_research_runs)").all() as Array<{ name: string }>;
    expect(table).toBeTruthy();
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining(["subject_type", "subject_key", "subject_label", "result_json"]));
  });

  it("creates versioned research document tables", () => {
    const db = new Database(":memory:");
    migrate(db);
    const documents = db.prepare("pragma table_info(research_documents)").all() as Array<{ name: string }>;
    const versions = db.prepare("pragma table_info(research_document_versions)").all() as Array<{ name: string }>;
    expect(documents.map((column) => column.name)).toEqual(expect.arrayContaining(["report_type", "subject_key", "current_version", "citations_json", "quality_json", "charts_json"]));
    expect(versions.map((column) => column.name)).toEqual(expect.arrayContaining(["report_id", "version_number", "change_summary", "source"]));
  });
});
