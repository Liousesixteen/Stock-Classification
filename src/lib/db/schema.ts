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

    create table if not exists company_research_profiles (
      stock_code text primary key references companies(stock_code) on delete cascade,
      summary text not null default '',
      business_lines text not null default '[]',
      chain_position text not null default '[]',
      competitive_advantages text not null default '[]',
      key_customers text not null default '[]',
      catalysts text not null default '[]',
      risks text not null default '[]',
      source_summary text not null default '',
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists sync_tasks (
      id integer primary key autoincrement,
      stock_code text not null references companies(stock_code) on delete cascade,
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

    create table if not exists company_source_snapshots (
      stock_code text not null references companies(stock_code) on delete cascade,
      provider text not null,
      provider_label text not null default '',
      status text not null check(status in ('success', 'failed', 'skipped')),
      facts_json text not null default '{}',
      error text not null default '',
      duration_ms integer not null default 0,
      fetched_at text not null default current_timestamp,
      expires_at text not null default '',
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp,
      primary key(stock_code, provider)
    );

    create table if not exists company_field_facts (
      stock_code text not null references companies(stock_code) on delete cascade,
      field_key text not null,
      provider text not null,
      provider_label text not null default '',
      value_json text not null default 'null',
      status text not null check(status in ('available', 'missing', 'failed', 'skipped')),
      source_url text not null default '',
      confidence text not null check(confidence in ('high', 'medium', 'low')),
      verification_status text not null check(verification_status in ('unverified', 'verified', 'conflicted', 'rejected')),
      error text not null default '',
      fetched_at text not null default current_timestamp,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp,
      primary key(stock_code, field_key, provider)
    );

    create table if not exists research_graph_entities (
      id integer primary key autoincrement,
      entity_type text not null,
      name text not null,
      summary text not null default '',
      is_active integer not null default 1,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp,
      unique(entity_type, name)
    );

    create table if not exists company_graph_entity_relations (
      id integer primary key autoincrement,
      stock_code text not null references companies(stock_code) on delete cascade,
      entity_id integer not null references research_graph_entities(id) on delete cascade,
      relation_type text not null,
      confidence text not null,
      rationale text not null default '',
      is_watchlist integer not null default 0,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp,
      unique(stock_code, entity_id)
    );

    create table if not exists company_graph_entity_evidences (
      id integer primary key autoincrement,
      entity_relation_id integer not null references company_graph_entity_relations(id) on delete cascade,
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

    create table if not exists ai_research_runs (
      id integer primary key autoincrement,
      stock_code text not null references companies(stock_code) on delete cascade,
      category_id integer references categories(id) on delete set null,
      question text not null default '',
      depth text not null default 'standard',
      status text not null,
      model text not null default '',
      result_json text not null default '{}',
      error text not null default '',
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists ai_research_reports (
      id integer primary key autoincrement,
      stock_code text not null references companies(stock_code) on delete cascade,
      category_id integer references categories(id) on delete set null,
      report_type text not null default 'company',
      title text not null,
      executive_summary text not null default '',
      content text not null,
      model text not null default '',
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists universal_research_runs (
      id integer primary key autoincrement,
      subject_type text not null check(subject_type in ('industry', 'question')),
      subject_key text not null,
      subject_label text not null,
      category_id integer references categories(id) on delete set null,
      question text not null default '',
      depth text not null default 'standard',
      status text not null,
      model text not null default '',
      result_json text not null default '{}',
      error text not null default '',
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists research_documents (
      id integer primary key autoincrement,
      report_type text not null check(report_type in ('company', 'industry', 'comparison', 'event')),
      subject_key text not null,
      subject_label text not null,
      stock_code text references companies(stock_code) on delete set null,
      category_id integer references categories(id) on delete set null,
      comparison_codes text not null default '[]',
      title text not null,
      executive_summary text not null default '',
      content text not null,
      model text not null default '',
      status text not null default 'draft' check(status in ('draft', 'ready', 'needs_work')),
      current_version integer not null default 1,
      citations_json text not null default '[]',
      quality_json text not null default '{}',
      charts_json text not null default '[]',
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists research_document_versions (
      id integer primary key autoincrement,
      report_id integer not null references research_documents(id) on delete cascade,
      version_number integer not null,
      content text not null,
      change_summary text not null default '',
      source text not null default 'generated' check(source in ('generated', 'edited', 'rewritten', 'restored')),
      model text not null default '',
      created_at text not null default current_timestamp,
      unique(report_id, version_number)
    );

    create table if not exists research_tasks (
      id integer primary key autoincrement,
      task_key text not null unique,
      task_type text not null check(task_type in (
        'missing_evidence',
        'stale_evidence',
        'low_confidence',
        'missing_profile',
        'missing_field',
        'sync_failure',
        'report_quality'
      )),
      status text not null default 'open' check(status in ('open', 'in_progress', 'completed', 'dismissed')),
      priority integer not null default 50,
      title text not null,
      description text not null default '',
      target_type text not null check(target_type in ('company', 'field', 'relation', 'evidence', 'report', 'industry')),
      stock_code text references companies(stock_code) on delete cascade,
      category_id integer references categories(id) on delete set null,
      relation_id integer references company_category_relations(id) on delete cascade,
      evidence_id integer references evidences(id) on delete cascade,
      report_id integer references research_documents(id) on delete cascade,
      field_key text not null default '',
      source_ref text not null default '',
      resolution text not null default '',
      auto_generated integer not null default 1,
      completed_at text not null default '',
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists research_artifact_states (
      artifact_id text primary key,
      archived integer not null default 0,
      pinned integer not null default 0,
      updated_at text not null default current_timestamp
    );

    create table if not exists operation_audit_events (
      id integer primary key autoincrement,
      request_id text not null default '',
      actor text not null default 'local',
      action text not null,
      target text not null default '',
      method text not null default '',
      status_code integer not null default 0,
      duration_ms integer not null default 0,
      outcome text not null check(outcome in ('success', 'failure')),
      error text not null default '',
      metadata_json text not null default '{}',
      created_at text not null default current_timestamp
    );

    create index if not exists idx_categories_parent on categories(parent_id, sort_order);
    create unique index if not exists idx_categories_root_name on categories(name) where parent_id is null;
    create index if not exists idx_relations_category on company_category_relations(category_id);
    create index if not exists idx_relations_stock on company_category_relations(stock_code);
    create index if not exists idx_evidences_relation on evidences(relation_id);
    create index if not exists idx_research_profiles_stock on company_research_profiles(stock_code);
    create index if not exists idx_sync_tasks_stock on sync_tasks(stock_code, task_type, id desc);
    create index if not exists idx_company_source_snapshots_stock on company_source_snapshots(stock_code, fetched_at desc);
    create index if not exists idx_company_field_facts_stock on company_field_facts(stock_code, field_key, status);
    create index if not exists idx_graph_entity_type on research_graph_entities(entity_type, is_active);
    create index if not exists idx_company_graph_entity_stock on company_graph_entity_relations(stock_code);
    create index if not exists idx_company_graph_entity_entity on company_graph_entity_relations(entity_id);
    create index if not exists idx_company_graph_entity_evidence_relation on company_graph_entity_evidences(entity_relation_id);
    create index if not exists idx_ai_research_runs_stock on ai_research_runs(stock_code, created_at desc);
    create index if not exists idx_ai_research_reports_stock on ai_research_reports(stock_code, created_at desc);
    create index if not exists idx_universal_research_subject on universal_research_runs(subject_type, subject_key, id desc);
    create index if not exists idx_research_documents_subject on research_documents(report_type, subject_key, id desc);
    create index if not exists idx_research_documents_stock on research_documents(stock_code, id desc);
    create index if not exists idx_research_document_versions_report on research_document_versions(report_id, version_number desc);
    create index if not exists idx_research_tasks_status on research_tasks(status, priority desc, updated_at desc);
    create index if not exists idx_research_tasks_stock on research_tasks(stock_code, status, priority desc);
    create index if not exists idx_operation_audit_created on operation_audit_events(created_at desc, id desc);
    create index if not exists idx_operation_audit_action on operation_audit_events(action, created_at desc);
  `);

  ensureColumn(db, "sync_tasks", "progress", "integer not null default 0");
  ensureColumn(db, "sync_tasks", "attempt_count", "integer not null default 0");
  ensureColumn(db, "sync_tasks", "max_attempts", "integer not null default 3");
  ensureColumn(db, "sync_tasks", "next_attempt_at", "text not null default ''");
  ensureColumn(db, "sync_tasks", "lease_expires_at", "text not null default ''");
  ensureColumn(db, "sync_tasks", "idempotency_key", "text not null default ''");
  ensureColumn(db, "sync_tasks", "payload_json", "text not null default '{}'");
  ensureColumn(db, "company_category_relations", "direction", "text not null default 'undirected'");
  ensureColumn(db, "company_category_relations", "strength", "integer not null default 50");
  ensureColumn(db, "company_category_relations", "observed_at", "text not null default ''");
  ensureColumn(db, "company_category_relations", "verification_status", "text not null default 'unverified'");
  ensureColumn(db, "company_category_relations", "verified_at", "text not null default ''");
  ensureColumn(db, "evidences", "verification_status", "text not null default 'unverified'");
  ensureColumn(db, "evidences", "verified_at", "text not null default ''");
  ensureColumn(db, "company_graph_entity_relations", "direction", "text not null default 'undirected'");
  ensureColumn(db, "company_graph_entity_relations", "strength", "integer not null default 50");
  ensureColumn(db, "company_graph_entity_relations", "observed_at", "text not null default ''");
  ensureColumn(db, "company_graph_entity_relations", "verification_status", "text not null default 'unverified'");
  ensureColumn(db, "company_graph_entity_relations", "verified_at", "text not null default ''");
  ensureColumn(db, "company_graph_entity_evidences", "verification_status", "text not null default 'unverified'");
  ensureColumn(db, "company_graph_entity_evidences", "verified_at", "text not null default ''");
  db.exec(`
    create index if not exists idx_sync_tasks_queue
      on sync_tasks(status, next_attempt_at, lease_expires_at, id);
    create unique index if not exists idx_sync_tasks_idempotency
      on sync_tasks(idempotency_key)
      where idempotency_key != '';
  `);
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) return;
  db.exec(`alter table ${table} add column ${column} ${definition}`);
}
