import type Database from "better-sqlite3";

export function migrate(db: Database.Database) {
  db.exec(`
    create table if not exists categories (
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

    create table if not exists companies (
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

    create table if not exists company_category_relations (
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

    create table if not exists evidences (
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

    create table if not exists research_notes (
      id integer primary key autoincrement,
      target_type text not null,
      target_id text not null,
      note_type text not null,
      content text not null,
      tags text not null default '[]',
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create index if not exists idx_categories_parent on categories(parent_id, sort_order);
    create unique index if not exists idx_categories_root_name on categories(name) where parent_id is null;
    create index if not exists idx_relations_category on company_category_relations(category_id);
    create index if not exists idx_relations_stock on company_category_relations(stock_code);
    create index if not exists idx_evidences_relation on evidences(relation_id);
  `);
}
