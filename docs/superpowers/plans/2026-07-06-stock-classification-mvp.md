# Stock Classification MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first local A 股产业链股票分类工作台 with a foldable semiconductor classification tree, stock relation filtering, company research details, CSV/XLSX import, SQLite persistence, and data quality checks.

**Architecture:** Use a local Next.js App Router application with server-side route handlers and a SQLite database file under `data/`. Keep domain logic in `src/lib/*` so import parsing, validation, repositories, and quality checks are testable without rendering UI. Keep UI components focused around the three-column workbench: tree, list, detail panel.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, SQLite via `better-sqlite3`, `zod` validation, `xlsx` import parsing, Vitest for unit tests, Playwright for one browser smoke test.

---

## File Structure

- `package.json`: scripts and dependencies.
- `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`: project tooling.
- `vitest.config.ts`, `playwright.config.ts`: test tooling.
- `.gitignore`: add SQLite database output and Playwright artifacts.
- `data/.gitkeep`: keeps the local data directory in git without committing database files.
- `src/app/layout.tsx`: application shell.
- `src/app/page.tsx`: workbench page.
- `src/app/globals.css`: base styling and Tailwind imports.
- `src/app/api/categories/route.ts`: category tree endpoint.
- `src/app/api/workbench/route.ts`: selected category workbench data endpoint.
- `src/app/api/companies/[code]/route.ts`: company detail endpoint.
- `src/app/api/import/preview/route.ts`: import preview endpoint.
- `src/app/api/import/commit/route.ts`: import commit endpoint.
- `src/app/api/quality/route.ts`: data quality endpoint.
- `src/components/workbench/Workbench.tsx`: client-side workbench container and state coordination.
- `src/components/workbench/ClassificationTree.tsx`: foldable classification tree.
- `src/components/workbench/StockTable.tsx`: relation result list.
- `src/components/workbench/CompanyDetails.tsx`: company research details.
- `src/components/workbench/WorkbenchToolbar.tsx`: search and import actions.
- `src/components/workbench/ImportDialog.tsx`: file import workflow.
- `src/components/workbench/QualityPanel.tsx`: data quality summary.
- `src/lib/domain/constants.ts`: relation types, confidence levels, source types, note types.
- `src/lib/domain/types.ts`: shared TypeScript types.
- `src/lib/domain/schemas.ts`: zod schemas for inbound data.
- `src/lib/db/client.ts`: SQLite connection factory.
- `src/lib/db/schema.ts`: table creation and indexes.
- `src/lib/db/seed.ts`: semiconductor classification seed and sample companies.
- `src/lib/repositories/categories.ts`: category reads and writes.
- `src/lib/repositories/companies.ts`: company reads and writes.
- `src/lib/repositories/relations.ts`: relation reads and writes.
- `src/lib/repositories/evidence.ts`: evidence reads and writes.
- `src/lib/import/parse.ts`: CSV/XLSX row parsing.
- `src/lib/import/preview.ts`: import validation and preview.
- `src/lib/import/commit.ts`: import persistence.
- `src/lib/quality/checks.ts`: missing evidence, missing intro, low confidence, and pending validation checks.
- `tests/db/schema.test.ts`: migration and seed tests.
- `tests/import/preview.test.ts`: import preview tests.
- `tests/quality/checks.test.ts`: quality check tests.
- `tests/e2e/workbench.spec.ts`: browser smoke test.

---

### Task 1: Project Foundation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Modify: `.gitignore`
- Create: `data/.gitkeep`

- [ ] **Step 1: Create project manifest**

Write `package.json` with these scripts and dependencies:

```json
{
  "name": "stock-classification",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "next lint"
  },
  "dependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "better-sqlite3": "^11.10.0",
    "lucide-react": "^0.468.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "xlsx": "^0.18.5",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.17.0",
    "eslint-config-next": "^15.0.0",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.0",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 3: Create TypeScript and framework config**

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Write `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {},
};

export default nextConfig;
```

Write `postcss.config.mjs`:

```js
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

Write `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#202733",
        muted: "#657184",
        line: "#d8dee8",
        panel: "#f7f9fc",
        accent: "#0f72e5",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 4: Create test config**

Write `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
```

Write `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [ ] **Step 5: Create minimal app shell**

Write `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
  background: #f4f6f9;
  color: #202733;
}

body {
  margin: 0;
  min-height: 100vh;
  background: #f4f6f9;
  color: #202733;
}
```

Write `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A 股产业链分类工作台",
  description: "本地 A 股产业链股票分类与研究工作台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

Write `src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold text-ink">A 股产业链分类工作台</h1>
      <p className="mt-2 text-sm text-muted">第一版正在搭建中。</p>
    </main>
  );
}
```

- [ ] **Step 6: Update ignore rules**

Append to `.gitignore`:

```gitignore
data/*.sqlite
data/*.db
playwright-report/
test-results/
coverage/
```

Create `data/.gitkeep` as an empty file.

- [ ] **Step 7: Verify foundation**

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts vitest.config.ts playwright.config.ts src/app data/.gitkeep .gitignore
git commit -m "chore: scaffold local stock classification app"
```

---

### Task 2: Domain Types and Validation

**Files:**
- Create: `src/lib/domain/constants.ts`
- Create: `src/lib/domain/types.ts`
- Create: `src/lib/domain/schemas.ts`
- Create: `tests/domain/schemas.test.ts`

- [ ] **Step 1: Write failing validation tests**

Create `tests/domain/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { relationInputSchema } from "@/lib/domain/schemas";

describe("domain schemas", () => {
  it("accepts a valid company-category relation", () => {
    const result = relationInputSchema.parse({
      stockCode: "300346",
      categoryId: 12,
      relationType: "主营业务",
      confidence: "高",
      rationale: "ArF 光刻胶产业化进展明确",
      isWatchlist: false,
    });

    expect(result.stockCode).toBe("300346");
    expect(result.relationType).toBe("主营业务");
  });

  it("rejects an unsupported relation type", () => {
    expect(() =>
      relationInputSchema.parse({
        stockCode: "300346",
        categoryId: 12,
        relationType: "随便写",
        confidence: "高",
        rationale: "bad",
        isWatchlist: false,
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/schemas.test.ts`

Expected: FAIL because `@/lib/domain/schemas` does not exist.

- [ ] **Step 3: Add constants, types, and schemas**

Write `src/lib/domain/constants.ts`:

```ts
export const RELATION_TYPES = ["主营业务", "重要相关", "概念/少量布局", "待验证"] as const;
export const CONFIDENCE_LEVELS = ["高", "中", "低"] as const;
export const SOURCE_TYPES = ["年报", "公告", "互动易", "研报", "网页", "手动备注", "其他"] as const;
export const NOTE_TYPES = ["研究备注", "催化因素", "风险点", "争议点", "待验证问题", "收入占比", "客户", "产能/项目进度"] as const;
```

Write `src/lib/domain/types.ts`:

```ts
import type { CONFIDENCE_LEVELS, NOTE_TYPES, RELATION_TYPES, SOURCE_TYPES } from "./constants";

export type RelationType = (typeof RELATION_TYPES)[number];
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type NoteType = (typeof NOTE_TYPES)[number];

export type CategoryNode = {
  id: number;
  name: string;
  parentId: number | null;
  level: number;
  sortOrder: number;
  aliases: string[];
  description: string;
  industry: string;
  isActive: boolean;
  children: CategoryNode[];
};

export type Company = {
  stockCode: string;
  shortName: string;
  fullName: string;
  board: string;
  industry: string;
  region: string;
  marketCapBand: string;
  intro: string;
  mainBusiness: string;
  updatedAt: string;
};

export type CompanyRelation = {
  id: number;
  stockCode: string;
  categoryId: number;
  relationType: RelationType;
  confidence: ConfidenceLevel;
  rationale: string;
  primaryEvidenceId: number | null;
  isWatchlist: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Evidence = {
  id: number;
  relationId: number;
  sourceType: SourceType;
  title: string;
  sourceDate: string;
  url: string;
  excerpt: string;
  credibility: ConfidenceLevel;
  isExpired: boolean;
};

export type ResearchNote = {
  id: number;
  targetType: "company" | "category" | "relation";
  targetId: string;
  noteType: NoteType;
  content: string;
  tags: string[];
};
```

Write `src/lib/domain/schemas.ts`:

```ts
import { z } from "zod";
import { CONFIDENCE_LEVELS, RELATION_TYPES, SOURCE_TYPES } from "./constants";

export const stockCodeSchema = z.string().regex(/^(00|30|60|68|83|87)\d{4}$/, "股票代码必须是 A 股 6 位代码");

export const relationInputSchema = z.object({
  stockCode: stockCodeSchema,
  categoryId: z.number().int().positive(),
  relationType: z.enum(RELATION_TYPES),
  confidence: z.enum(CONFIDENCE_LEVELS),
  rationale: z.string().trim().min(1),
  isWatchlist: z.boolean().default(false),
});

export const evidenceInputSchema = z.object({
  relationId: z.number().int().positive(),
  sourceType: z.enum(SOURCE_TYPES),
  title: z.string().trim().min(1),
  sourceDate: z.string().trim().default(""),
  url: z.string().trim().default(""),
  excerpt: z.string().trim().default(""),
  credibility: z.enum(CONFIDENCE_LEVELS).default("中"),
  isExpired: z.boolean().default(false),
});
```

- [ ] **Step 4: Verify tests pass**

Run: `npm test -- tests/domain/schemas.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain tests/domain
git commit -m "feat: define stock classification domain types"
```

---

### Task 3: SQLite Schema and Seed Data

**Files:**
- Create: `src/lib/db/client.ts`
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/db/seed.ts`
- Create: `tests/db/schema.test.ts`

- [ ] **Step 1: Write failing database test**

Create `tests/db/schema.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/db/schema.test.ts`

Expected: FAIL because database modules do not exist.

- [ ] **Step 3: Implement database client and schema**

Write `src/lib/db/client.ts`:

```ts
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
```

Write `src/lib/db/schema.ts`:

```ts
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
      primary_evidence_id integer,
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
    create index if not exists idx_relations_category on company_category_relations(category_id);
    create index if not exists idx_relations_stock on company_category_relations(stock_code);
    create index if not exists idx_evidences_relation on evidences(relation_id);
  `);
}
```

- [ ] **Step 4: Implement semiconductor seed**

Write `src/lib/db/seed.ts`:

```ts
import type Database from "better-sqlite3";

type SeedNode = {
  name: string;
  children?: SeedNode[];
};

const semiconductorTree: SeedNode = {
  name: "半导体",
  children: [
    {
      name: "材料",
      children: [
        {
          name: "光刻材料",
          children: [
            {
              name: "光刻胶",
              children: [
                { name: "g/i 线光刻胶" },
                { name: "KrF 光刻胶" },
                { name: "ArF 干法/浸没式光刻胶" },
                { name: "EUV 光刻胶" },
              ],
            },
            { name: "显影液/剥离液" },
            { name: "抗反射涂层 BARC" },
            { name: "光掩膜版/掩膜基板" },
          ],
        },
        { name: "硅材料", children: [{ name: "6/8/12 英寸硅晶圆片" }, { name: "抛光片" }, { name: "外延片" }, { name: "SOI 硅片" }] },
        { name: "湿电子化学品", children: [{ name: "高纯酸/碱/溶剂" }, { name: "清洗液" }, { name: "刻蚀液" }, { name: "电镀液" }] },
        { name: "电子特气", children: [{ name: "刻蚀气体" }, { name: "沉积气体" }, { name: "掺杂气体" }, { name: "清洗/载气" }] },
        { name: "CMP 材料", children: [{ name: "CMP 抛光液" }, { name: "CMP 抛光垫" }, { name: "清洗液/调节器" }] },
        { name: "靶材/前驱体", children: [{ name: "溅射靶材" }, { name: "ALD/CVD 前驱体" }, { name: "MO 源" }] },
        { name: "封装材料", children: [{ name: "环氧塑封料 EMC" }, { name: "基板/载板" }, { name: "键合丝/焊球" }, { name: "底填胶/导热材料" }] },
      ],
    },
    { name: "设备", children: [{ name: "光刻设备" }, { name: "刻蚀设备" }, { name: "薄膜沉积设备" }, { name: "清洗设备" }, { name: "离子注入设备" }, { name: "量测/测试设备" }] },
    { name: "EDA/IP" },
    { name: "设计" },
    { name: "制造" },
    { name: "封测" },
  ],
};

export function seedSemiconductorData(db: Database.Database) {
  const existing = db.prepare("select id from categories where name = ? and parent_id is null").get("半导体");
  if (existing) return;

  const insert = db.prepare(`
    insert into categories (name, parent_id, level, sort_order, industry)
    values (@name, @parentId, @level, @sortOrder, '半导体')
  `);

  const insertNode = (node: SeedNode, parentId: number | null, level: number, sortOrder: number) => {
    const result = insert.run({ name: node.name, parentId, level, sortOrder });
    const id = Number(result.lastInsertRowid);
    node.children?.forEach((child, index) => insertNode(child, id, level + 1, index));
    return id;
  };

  insertNode(semiconductorTree, null, 0, 0);

  db.prepare(`
    insert or ignore into companies (stock_code, short_name, board, industry, intro, main_business)
    values (?, ?, ?, ?, ?, ?)
  `).run("300346", "南大光电", "创业板", "电子材料", "示例公司简介：半导体材料企业，业务覆盖光刻胶、电子特气和 MO 源。", "光刻胶、电子特气、MO 源");
}
```

- [ ] **Step 5: Verify tests pass**

Run: `npm test -- tests/db/schema.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db tests/db
git commit -m "feat: add sqlite schema and semiconductor seed"
```

---

### Task 4: Repositories and Workbench Queries

**Files:**
- Create: `src/lib/repositories/categories.ts`
- Create: `src/lib/repositories/companies.ts`
- Create: `src/lib/repositories/relations.ts`
- Create: `src/lib/repositories/evidence.ts`
- Create: `tests/repositories/workbench.test.ts`

- [ ] **Step 1: Write failing repository test**

Create `tests/repositories/workbench.test.ts`:

```ts
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { getCategoryTree, findCategoryByPath } from "@/lib/repositories/categories";
import { upsertCompany } from "@/lib/repositories/companies";
import { upsertRelation, listRelationsForCategory } from "@/lib/repositories/relations";

describe("workbench repositories", () => {
  it("returns category tree and relations for a selected category", () => {
    const db = new Database(":memory:");
    migrate(db);
    seedSemiconductorData(db);

    const category = findCategoryByPath(db, ["半导体", "材料", "光刻材料", "光刻胶", "ArF 干法/浸没式光刻胶"]);
    expect(category?.name).toBe("ArF 干法/浸没式光刻胶");

    upsertCompany(db, {
      stockCode: "300655",
      shortName: "晶瑞电材",
      fullName: "",
      board: "创业板",
      industry: "电子材料",
      region: "",
      marketCapBand: "",
      intro: "示例简介",
      mainBusiness: "光刻胶及配套电子化学品",
      updatedAt: "",
    });

    upsertRelation(db, {
      stockCode: "300655",
      categoryId: category!.id,
      relationType: "主营业务",
      confidence: "高",
      rationale: "光刻胶及配套电子化学品",
      isWatchlist: false,
    });

    const tree = getCategoryTree(db);
    const rows = listRelationsForCategory(db, category!.id);

    expect(tree[0].name).toBe("半导体");
    expect(rows[0].shortName).toBe("晶瑞电材");
    expect(rows[0].relationType).toBe("主营业务");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/repositories/workbench.test.ts`

Expected: FAIL because repository modules do not exist.

- [ ] **Step 3: Implement repositories**

Write `src/lib/repositories/categories.ts` with functions:

```ts
import type Database from "better-sqlite3";
import type { CategoryNode } from "@/lib/domain/types";

type CategoryRow = {
  id: number;
  name: string;
  parent_id: number | null;
  level: number;
  sort_order: number;
  aliases: string;
  description: string;
  industry: string;
  is_active: number;
};

function mapRow(row: CategoryRow): CategoryNode {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    level: row.level,
    sortOrder: row.sort_order,
    aliases: JSON.parse(row.aliases) as string[],
    description: row.description,
    industry: row.industry,
    isActive: row.is_active === 1,
    children: [],
  };
}

export function getCategoryTree(db: Database.Database): CategoryNode[] {
  const rows = db.prepare("select * from categories where is_active = 1 order by level, sort_order, id").all() as CategoryRow[];
  const nodes = new Map<number, CategoryNode>();
  rows.forEach((row) => nodes.set(row.id, mapRow(row)));

  const roots: CategoryNode[] = [];
  nodes.forEach((node) => {
    if (node.parentId == null) {
      roots.push(node);
      return;
    }
    nodes.get(node.parentId)?.children.push(node);
  });

  return roots;
}

export function findCategoryByPath(db: Database.Database, path: string[]) {
  let parentId: number | null = null;
  let current: CategoryRow | undefined;

  for (const name of path) {
    current = db
      .prepare("select * from categories where name = ? and parent_id is ? and is_active = 1")
      .get(name, parentId) as CategoryRow | undefined;
    if (!current) return undefined;
    parentId = current.id;
  }

  return current ? mapRow(current) : undefined;
}
```

Write `src/lib/repositories/companies.ts`:

```ts
import type Database from "better-sqlite3";
import type { Company } from "@/lib/domain/types";

export function upsertCompany(db: Database.Database, company: Company) {
  db.prepare(`
    insert into companies (stock_code, short_name, full_name, board, industry, region, market_cap_band, intro, main_business, updated_at)
    values (@stockCode, @shortName, @fullName, @board, @industry, @region, @marketCapBand, @intro, @mainBusiness, current_timestamp)
    on conflict(stock_code) do update set
      short_name = excluded.short_name,
      full_name = excluded.full_name,
      board = excluded.board,
      industry = excluded.industry,
      region = excluded.region,
      market_cap_band = excluded.market_cap_band,
      intro = case when excluded.intro <> '' then excluded.intro else companies.intro end,
      main_business = case when excluded.main_business <> '' then excluded.main_business else companies.main_business end,
      updated_at = current_timestamp
  `).run(company);
}

export function getCompany(db: Database.Database, stockCode: string) {
  return db.prepare("select * from companies where stock_code = ?").get(stockCode);
}
```

Write `src/lib/repositories/relations.ts`:

```ts
import type Database from "better-sqlite3";
import type { ConfidenceLevel, RelationType } from "@/lib/domain/types";

export type RelationInput = {
  stockCode: string;
  categoryId: number;
  relationType: RelationType;
  confidence: ConfidenceLevel;
  rationale: string;
  isWatchlist: boolean;
};

export function upsertRelation(db: Database.Database, relation: RelationInput) {
  const result = db.prepare(`
    insert into company_category_relations (stock_code, category_id, relation_type, confidence, rationale, is_watchlist)
    values (@stockCode, @categoryId, @relationType, @confidence, @rationale, @isWatchlist)
    on conflict(stock_code, category_id) do update set
      relation_type = excluded.relation_type,
      confidence = excluded.confidence,
      rationale = excluded.rationale,
      is_watchlist = excluded.is_watchlist,
      updated_at = current_timestamp
    returning id
  `).get({ ...relation, isWatchlist: relation.isWatchlist ? 1 : 0 }) as { id: number };

  return result.id;
}

export function listRelationsForCategory(db: Database.Database, categoryId: number) {
  return db.prepare(`
    select
      r.id,
      r.stock_code as stockCode,
      c.short_name as shortName,
      c.intro,
      r.category_id as categoryId,
      r.relation_type as relationType,
      r.confidence,
      r.rationale,
      coalesce(e.source_type, '') as sourceType,
      coalesce(e.title, '') as sourceTitle
    from company_category_relations r
    join companies c on c.stock_code = r.stock_code
    left join evidences e on e.id = r.primary_evidence_id
    where r.category_id = ?
    order by
      case r.relation_type when '主营业务' then 0 when '重要相关' then 1 when '概念/少量布局' then 2 else 3 end,
      c.stock_code
  `).all(categoryId);
}

export function listRelationsForCompany(db: Database.Database, stockCode: string) {
  return db.prepare(`
    select r.*, cat.name as categoryName
    from company_category_relations r
    join categories cat on cat.id = r.category_id
    where r.stock_code = ?
    order by r.updated_at desc
  `).all(stockCode);
}
```

Write `src/lib/repositories/evidence.ts`:

```ts
import type Database from "better-sqlite3";
import type { ConfidenceLevel, SourceType } from "@/lib/domain/types";

export type EvidenceInput = {
  relationId: number;
  sourceType: SourceType;
  title: string;
  sourceDate: string;
  url: string;
  excerpt: string;
  credibility: ConfidenceLevel;
  isExpired: boolean;
};

export function createEvidence(db: Database.Database, evidence: EvidenceInput) {
  const result = db.prepare(`
    insert into evidences (relation_id, source_type, title, source_date, url, excerpt, credibility, is_expired)
    values (@relationId, @sourceType, @title, @sourceDate, @url, @excerpt, @credibility, @isExpired)
  `).run({ ...evidence, isExpired: evidence.isExpired ? 1 : 0 });

  return Number(result.lastInsertRowid);
}

export function listEvidenceForRelation(db: Database.Database, relationId: number) {
  return db.prepare("select * from evidences where relation_id = ? order by created_at desc").all(relationId);
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npm test -- tests/repositories/workbench.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repositories tests/repositories
git commit -m "feat: add workbench repositories"
```

---

### Task 5: Import Preview and Commit

**Files:**
- Create: `src/lib/import/parse.ts`
- Create: `src/lib/import/preview.ts`
- Create: `src/lib/import/commit.ts`
- Create: `tests/import/preview.test.ts`

- [ ] **Step 1: Write failing import preview test**

Create `tests/import/preview.test.ts`:

```ts
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { previewImportRows } from "@/lib/import/preview";

describe("import preview", () => {
  it("validates rows and maps category paths", () => {
    const db = new Database(":memory:");
    migrate(db);
    seedSemiconductorData(db);

    const preview = previewImportRows(db, [
      {
        股票代码: "300655",
        公司简称: "晶瑞电材",
        分类路径: "半导体/材料/光刻材料/光刻胶/ArF 干法/浸没式光刻胶",
        关系类型: "主营业务",
        确信度: "高",
        判断说明: "光刻胶及配套电子化学品",
        来源类型: "年报",
        来源标题: "2025 年报",
        来源链接: "https://example.com/report",
      },
    ]);

    expect(preview.validRows).toHaveLength(1);
    expect(preview.errors).toHaveLength(0);
    expect(preview.validRows[0].categoryPath).toContain("ArF 干法/浸没式光刻胶");
  });

  it("reports unknown categories and invalid relation types", () => {
    const db = new Database(":memory:");
    migrate(db);
    seedSemiconductorData(db);

    const preview = previewImportRows(db, [
      {
        股票代码: "300655",
        公司简称: "晶瑞电材",
        分类路径: "半导体/材料/不存在",
        关系类型: "乱写",
        确信度: "高",
      },
    ]);

    expect(preview.validRows).toHaveLength(0);
    expect(preview.errors[0].messages).toContain("分类路径不存在");
    expect(preview.errors[0].messages).toContain("关系类型无效");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/import/preview.test.ts`

Expected: FAIL because import modules do not exist.

- [ ] **Step 3: Implement parsing and preview**

Implement `src/lib/import/parse.ts` with `parseWorkbook(buffer: Buffer)` returning array records from CSV/XLSX using `xlsx`.

Implement `src/lib/import/preview.ts` with:

```ts
export type RawImportRow = Record<string, unknown>;

export type ValidImportRow = {
  stockCode: string;
  shortName: string;
  categoryId: number;
  categoryPath: string[];
  relationType: "主营业务" | "重要相关" | "概念/少量布局" | "待验证";
  confidence: "高" | "中" | "低";
  rationale: string;
  sourceType: "年报" | "公告" | "互动易" | "研报" | "网页" | "手动备注" | "其他";
  sourceTitle: string;
  sourceUrl: string;
  intro: string;
  note: string;
};

export type ImportPreview = {
  validRows: ValidImportRow[];
  errors: Array<{ rowNumber: number; messages: string[] }>;
  unknownCategories: string[];
  duplicateKeys: string[];
};
```

Use exact Chinese column names from the spec. Validate relation type and confidence against domain constants. Resolve category paths with `findCategoryByPath`.

- [ ] **Step 4: Implement commit**

Implement `src/lib/import/commit.ts` with `commitImportRows(db, rows)` that:

1. Upserts company by stock code.
2. Upserts relation by stock code and category ID.
3. Creates evidence when `sourceTitle` or `sourceUrl` exists.
4. Creates a research note when `note` exists.
5. Returns `{ companiesUpserted, relationsUpserted, evidencesCreated, notesCreated }`.

- [ ] **Step 5: Verify tests pass**

Run: `npm test -- tests/import/preview.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/import tests/import
git commit -m "feat: add import preview and commit logic"
```

---

### Task 6: API Route Handlers

**Files:**
- Create: `src/app/api/categories/route.ts`
- Create: `src/app/api/workbench/route.ts`
- Create: `src/app/api/companies/[code]/route.ts`
- Create: `src/app/api/import/preview/route.ts`
- Create: `src/app/api/import/commit/route.ts`
- Create: `src/app/api/quality/route.ts`

- [ ] **Step 1: Implement category and workbench APIs**

`src/app/api/categories/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { getCategoryTree } from "@/lib/repositories/categories";

export async function GET() {
  const db = getDatabase();
  return NextResponse.json({ categories: getCategoryTree(db) });
}
```

`src/app/api/workbench/route.ts` reads `categoryId` from `request.nextUrl.searchParams`, returns selected category relations, and defaults to the first semiconductor leaf with sample data if the parameter is missing.

- [ ] **Step 2: Implement company detail API**

`src/app/api/companies/[code]/route.ts` loads company, relations, evidences, and notes by stock code. Return `404` JSON `{ "error": "公司不存在" }` if the company is missing.

- [ ] **Step 3: Implement import APIs**

`src/app/api/import/preview/route.ts` accepts multipart `file`, parses rows, and returns preview. `src/app/api/import/commit/route.ts` accepts preview rows JSON and persists them.

- [ ] **Step 4: Implement quality API**

`src/app/api/quality/route.ts` calls quality checks from Task 7 and returns `{ checks: [...] }`.

- [ ] **Step 5: Verify API code typechecks**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api
git commit -m "feat: expose local workbench api"
```

---

### Task 7: Data Quality Checks

**Files:**
- Create: `src/lib/quality/checks.ts`
- Create: `tests/quality/checks.test.ts`

- [ ] **Step 1: Write failing quality tests**

Create `tests/quality/checks.test.ts`:

```ts
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { runQualityChecks } from "@/lib/quality/checks";

describe("quality checks", () => {
  it("reports missing company intro and missing evidence", () => {
    const db = new Database(":memory:");
    migrate(db);
    seedSemiconductorData(db);
    db.prepare("insert into companies (stock_code, short_name) values (?, ?)").run("300655", "晶瑞电材");
    const category = db.prepare("select id from categories where name = ?").get("KrF 光刻胶") as { id: number };
    db.prepare(`
      insert into company_category_relations (stock_code, category_id, relation_type, confidence, rationale)
      values (?, ?, ?, ?, ?)
    `).run("300655", category.id, "主营业务", "高", "光刻胶及配套电子化学品");

    const checks = runQualityChecks(db);

    expect(checks.some((item) => item.type === "缺公司简介")).toBe(true);
    expect(checks.some((item) => item.type === "缺证据")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/quality/checks.test.ts`

Expected: FAIL because `runQualityChecks` does not exist.

- [ ] **Step 3: Implement quality checks**

Write `src/lib/quality/checks.ts`:

```ts
import type Database from "better-sqlite3";

export type QualityIssue = {
  type: "缺公司简介" | "缺证据" | "低确信度" | "待验证关系";
  severity: "high" | "medium" | "low";
  stockCode?: string;
  relationId?: number;
  message: string;
};

export function runQualityChecks(db: Database.Database): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const missingIntro = db.prepare("select stock_code, short_name from companies where trim(intro) = ''").all() as Array<{ stock_code: string; short_name: string }>;
  missingIntro.forEach((row) => {
    issues.push({
      type: "缺公司简介",
      severity: "medium",
      stockCode: row.stock_code,
      message: `${row.short_name} 缺少公司简介`,
    });
  });

  const missingEvidence = db
    .prepare(`
      select r.id, r.stock_code
      from company_category_relations r
      left join evidences e on e.relation_id = r.id
      where e.id is null
    `)
    .all() as Array<{ id: number; stock_code: string }>;
  missingEvidence.forEach((row) => {
    issues.push({
      type: "缺证据",
      severity: "high",
      stockCode: row.stock_code,
      relationId: row.id,
      message: `关系 ${row.id} 缺少证据来源`,
    });
  });

  const lowConfidence = db.prepare("select id, stock_code from company_category_relations where confidence = '低'").all() as Array<{ id: number; stock_code: string }>;
  lowConfidence.forEach((row) => {
    issues.push({
      type: "低确信度",
      severity: "low",
      stockCode: row.stock_code,
      relationId: row.id,
      message: `关系 ${row.id} 为低确信度`,
    });
  });

  const watchlist = db.prepare("select id, stock_code from company_category_relations where is_watchlist = 1 or relation_type = '待验证'").all() as Array<{ id: number; stock_code: string }>;
  watchlist.forEach((row) => {
    issues.push({
      type: "待验证关系",
      severity: "medium",
      stockCode: row.stock_code,
      relationId: row.id,
      message: `关系 ${row.id} 需要复核`,
    });
  });

  return issues;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npm test -- tests/quality/checks.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quality tests/quality
git commit -m "feat: add data quality checks"
```

---

### Task 8: Three-Column Workbench UI

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/workbench/Workbench.tsx`
- Create: `src/components/workbench/ClassificationTree.tsx`
- Create: `src/components/workbench/StockTable.tsx`
- Create: `src/components/workbench/CompanyDetails.tsx`
- Create: `src/components/workbench/WorkbenchToolbar.tsx`
- Create: `src/components/workbench/ImportDialog.tsx`
- Create: `src/components/workbench/QualityPanel.tsx`

- [ ] **Step 1: Build workbench page and client container**

Replace `src/app/page.tsx` with:

```tsx
import { Workbench } from "@/components/workbench/Workbench";

export default function HomePage() {
  return <Workbench />;
}
```

Create `src/components/workbench/Workbench.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { ClassificationTree } from "./ClassificationTree";
import { CompanyDetails } from "./CompanyDetails";
import { ImportDialog } from "./ImportDialog";
import { QualityPanel } from "./QualityPanel";
import { StockTable } from "./StockTable";
import { WorkbenchToolbar } from "./WorkbenchToolbar";

export function Workbench() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedStockCode, setSelectedStockCode] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setSelectedStockCode(null);
  }, [selectedCategoryId]);

  return (
    <main className="min-h-screen bg-[#f4f6f9] p-6 text-ink">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">A 股产业链分类工作台</h1>
        <p className="mt-1 text-sm text-muted">按产业链细分方向快速找到 A 股标的，并沉淀证据和研究备注。</p>
      </div>

      <div className="grid min-h-[720px] grid-cols-[340px_minmax(520px,1fr)_420px] gap-4">
        <aside className="rounded-lg border border-line bg-white p-4">
          <ClassificationTree selectedCategoryId={selectedCategoryId} onSelect={setSelectedCategoryId} refreshKey={refreshKey} />
        </aside>

        <section className="flex min-w-0 flex-col gap-3">
          <WorkbenchToolbar onImported={() => setRefreshKey((value) => value + 1)} />
          <StockTable selectedCategoryId={selectedCategoryId} selectedStockCode={selectedStockCode} onSelectStock={setSelectedStockCode} refreshKey={refreshKey} />
        </section>

        <aside className="rounded-lg border border-line bg-white p-4">
          <CompanyDetails stockCode={selectedStockCode} refreshKey={refreshKey} />
        </aside>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_420px] gap-4">
        <ImportDialog onImported={() => setRefreshKey((value) => value + 1)} />
        <QualityPanel refreshKey={refreshKey} />
      </div>
    </main>
  );
}
```

The page must render:

- Title: `A 股产业链分类工作台`
- Left panel heading: `行业 / 产业链`
- Search placeholder: `搜索：ArF、12英寸硅片、CMP抛光垫、电子特气`
- Right panel heading: `公司研究详情`

- [ ] **Step 2: Implement foldable tree**

Create `ClassificationTree.tsx` using nested `<details>` and `<summary>`. The active category receives a selected background. Clicking a category updates `selectedCategoryId`.

- [ ] **Step 3: Implement stock table**

Create `StockTable.tsx` with columns:

```txt
代码 | 公司 | 归类说明 | 关系 | 确信度 | 来源
```

Clicking a row updates `selectedStockCode`.

- [ ] **Step 4: Implement company details**

Create `CompanyDetails.tsx` with sections:

```txt
公司简介
基础信息
分类关系
业务证据
产品与产业位置
研究字段
```

When no company is selected, show `请选择一家公司查看研究详情`.

- [ ] **Step 5: Implement import and quality panels**

Create `ImportDialog.tsx` with file input, preview table, and commit button. Create `QualityPanel.tsx` that lists issues grouped by type.

- [ ] **Step 6: Verify UI typechecks**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/components/workbench
git commit -m "feat: build three column workbench ui"
```

---

### Task 9: Browser Smoke Test and First-Run Verification

**Files:**
- Create: `tests/e2e/workbench.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Write Playwright smoke test**

Create `tests/e2e/workbench.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("loads the stock classification workbench", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A 股产业链分类工作台" })).toBeVisible();
  await expect(page.getByText("行业 / 产业链")).toBeVisible();
  await expect(page.getByText("公司研究详情")).toBeVisible();
  await expect(page.getByText("ArF 干法/浸没式光刻胶")).toBeVisible();
});
```

- [ ] **Step 2: Add README**

Create `README.md`:

```md
# A 股产业链分类工作台

本项目是一个本地网页应用，用于维护 A 股产业链细分分类、公司关系、证据来源和研究备注。

## 本地启动

\`\`\`bash
npm install
npm run dev
\`\`\`

打开 http://localhost:3000。

## 验证

\`\`\`bash
npm run typecheck
npm test
npm run build
npm run test:e2e
\`\`\`

## 数据

本地 SQLite 文件保存在 `data/stock-classification.sqlite`。数据库文件不会提交到 git。
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Expected:

- Typecheck passes.
- Unit tests pass.
- Production build completes.
- Browser smoke test passes and sees the workbench.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e README.md
git commit -m "test: add workbench smoke coverage"
```

---

## Self-Review Checklist

- Spec coverage:
  - Local Next.js app: Task 1.
  - SQLite persistence: Tasks 3 and 4.
  - Foldable semiconductor classification tree: Tasks 3 and 8.
  - Company research details with intro: Task 8.
  - Company-category relation types and confidence: Tasks 2, 4, and 8.
  - Evidence sources and notes: Tasks 3, 4, and 5.
  - Excel/CSV import preview and commit: Task 5 and Task 6.
  - Data quality checks: Task 7 and Task 8.
  - Verification: Tasks 1 through 9.

- No placeholders:
  - The plan names concrete files, commands, expected outcomes, and required fields.
  - Every task ends with a verification command and commit.

- Type consistency:
  - `relationType`, `confidence`, `stockCode`, `categoryId`, `rationale`, and `isWatchlist` are used consistently across schemas, repositories, import, and UI.
  - Evidence uses `credibility` in code and “证据可信度” in product wording.
