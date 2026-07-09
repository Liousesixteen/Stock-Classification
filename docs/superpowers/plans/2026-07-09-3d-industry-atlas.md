# 3D Industry Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-ready 3D industry-chain atlas to the existing A-share research workbench without slowing down the current research workflow.

**Architecture:** Keep selection state in the existing `Workbench` shell and switch between research and atlas views. A server endpoint returns a normalized graph generated from the current SQLite categories, relations, companies, and evidence counts; a dynamically imported Three.js scene renders that graph and reports node selection through React callbacks. Pure graph adaptation, deterministic layout, and quality-tier logic stay outside the renderer so they can be tested without WebGL.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Three.js, Tailwind CSS, Vitest, Testing Library, Playwright.

---

## File Structure

### New files

- `src/lib/industry-graph/types.ts`: Shared graph payload, node, edge, layout, and quality types.
- `src/lib/industry-graph/adapter.ts`: Pure conversion from categories and relation rows to a stable graph payload.
- `src/lib/industry-graph/layout.ts`: Deterministic 3D coordinates and rendering-quality selection.
- `src/lib/repositories/industryGraph.ts`: One SQLite query for all company/category graph relations and evidence counts.
- `src/app/api/industry-graph/route.ts`: Read-only graph endpoint.
- `src/components/atlas/IndustryAtlas.tsx`: Atlas layout, fetch lifecycle, filters, fallback, and selection orchestration.
- `src/components/atlas/IndustryGraphScene.tsx`: Three.js scene lifecycle and pointer interaction.
- `src/components/atlas/AtlasLayerNav.tsx`: Read-only industry-layer navigation.
- `src/components/atlas/AtlasCompanySnapshot.tsx`: Compact selected-company summary.
- `src/components/atlas/GraphFallback.tsx`: Accessible non-WebGL list fallback.
- `src/components/workbench/WorkbenchModeSwitch.tsx`: Research/atlas segmented control.
- `tests/industry-graph/adapter.test.ts`: Graph adapter unit tests.
- `tests/industry-graph/layout.test.ts`: Layout and quality-tier unit tests.
- `tests/repositories/industryGraph.test.ts`: Repository aggregation test.
- `tests/components/workbenchModeSwitch.test.tsx`: Mode switch persistence and accessibility tests.
- `tests/components/atlasCompanySnapshot.test.tsx`: Compact snapshot states.

### Modified files

- `package.json` and `package-lock.json`: Add `three`.
- `src/components/workbench/Workbench.tsx`: Hoist shared state and render the selected mode.
- `src/components/workbench/CompanyDetails.tsx`: Export a compact snapshot mapper used by the atlas.
- `src/components/workbench/types.ts`: Add workbench mode and selected-entity types.
- `src/app/globals.css`: Add atlas visual tokens, scene chrome, transitions, reduced-motion, and mobile layout.
- `tests/e2e/workbench.spec.ts`: Add end-to-end atlas and cross-mode selection coverage.

## Task 1: Graph Types and Adapter

**Files:**
- Create: `src/lib/industry-graph/types.ts`
- Create: `src/lib/industry-graph/adapter.ts`
- Create: `tests/industry-graph/adapter.test.ts`

- [ ] **Step 1: Write the failing adapter tests**

```ts
import { describe, expect, it } from "vitest";
import { buildIndustryGraph } from "@/lib/industry-graph/adapter";
import type { CategoryNode } from "@/lib/domain/types";

const categories: CategoryNode[] = [
  {
    id: 1,
    name: "半导体",
    parentId: null,
    level: 0,
    sortOrder: 0,
    aliases: [],
    description: "",
    industry: "半导体",
    isActive: true,
    children: [
      {
        id: 2,
        name: "封测",
        parentId: 1,
        level: 1,
        sortOrder: 0,
        aliases: [],
        description: "",
        industry: "半导体",
        isActive: true,
        children: [],
      },
    ],
  },
];

describe("buildIndustryGraph", () => {
  it("creates stable category, company, and relation nodes", () => {
    const graph = buildIndustryGraph(categories, [
      {
        categoryId: 2,
        stockCode: "002156",
        shortName: "通富微电",
        relationType: "主营业务",
        confidence: "高",
        evidenceCount: 12,
      },
    ]);

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "category:1",
      "category:2",
      "company:002156",
    ]);
    expect(graph.edges.map((edge) => edge.id)).toEqual([
      "category:1->category:2",
      "category:2->company:002156",
    ]);
    expect(graph.stats).toEqual({ categoryCount: 2, companyCount: 1, evidenceCount: 12 });
  });

  it("deduplicates companies related to multiple categories", () => {
    const graph = buildIndustryGraph(categories, [
      { categoryId: 1, stockCode: "002156", shortName: "通富微电", relationType: "重要相关", confidence: "中", evidenceCount: 2 },
      { categoryId: 2, stockCode: "002156", shortName: "通富微电", relationType: "主营业务", confidence: "高", evidenceCount: 3 },
    ]);

    expect(graph.nodes.filter((node) => node.kind === "company")).toHaveLength(1);
    expect(graph.stats.evidenceCount).toBe(5);
  });
});
```

- [ ] **Step 2: Run the adapter tests and verify failure**

Run:

```bash
npm test -- tests/industry-graph/adapter.test.ts
```

Expected: FAIL because `@/lib/industry-graph/adapter` does not exist.

- [ ] **Step 3: Add graph types and the minimal pure adapter**

```ts
// src/lib/industry-graph/types.ts
import type { ConfidenceLevel, RelationType } from "@/lib/domain/types";

export type IndustryGraphRelationRow = {
  categoryId: number;
  stockCode: string;
  shortName: string;
  relationType: RelationType;
  confidence: ConfidenceLevel;
  evidenceCount: number;
};

export type IndustryGraphNode =
  | {
      id: string;
      kind: "category";
      label: string;
      categoryId: number;
      parentId: number | null;
      level: number;
      layoutSeed: number;
    }
  | {
      id: string;
      kind: "company";
      label: string;
      stockCode: string;
      relationType: RelationType;
      confidence: ConfidenceLevel;
      evidenceCount: number;
      layoutSeed: number;
    };

export type IndustryGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "hierarchy" | "relation";
  relationType?: RelationType;
  confidence?: ConfidenceLevel;
  evidenceCount: number;
};

export type IndustryGraphPayload = {
  nodes: IndustryGraphNode[];
  edges: IndustryGraphEdge[];
  stats: { categoryCount: number; companyCount: number; evidenceCount: number };
};
```

```ts
// src/lib/industry-graph/adapter.ts
import type { CategoryNode } from "@/lib/domain/types";
import type { IndustryGraphNode, IndustryGraphPayload, IndustryGraphRelationRow } from "./types";

export function stableSeed(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildIndustryGraph(categories: CategoryNode[], relations: IndustryGraphRelationRow[]): IndustryGraphPayload {
  const nodes: IndustryGraphNode[] = [];
  const edges: IndustryGraphPayload["edges"] = [];
  const companies = new Map<string, Extract<IndustryGraphNode, { kind: "company" }>>();

  const visit = (category: CategoryNode) => {
    nodes.push({
      id: `category:${category.id}`,
      kind: "category",
      label: category.name,
      categoryId: category.id,
      parentId: category.parentId,
      level: category.level,
      layoutSeed: stableSeed(`category:${category.id}`),
    });
    if (category.parentId !== null) {
      edges.push({
        id: `category:${category.parentId}->category:${category.id}`,
        source: `category:${category.parentId}`,
        target: `category:${category.id}`,
        kind: "hierarchy",
        evidenceCount: 0,
      });
    }
    category.children.forEach(visit);
  };
  categories.forEach(visit);

  for (const relation of relations) {
    const companyId = `company:${relation.stockCode}`;
    const existing = companies.get(relation.stockCode);
    if (existing) {
      existing.evidenceCount += relation.evidenceCount;
    } else {
      const company: Extract<IndustryGraphNode, { kind: "company" }> = {
        id: companyId,
        kind: "company",
        label: relation.shortName,
        stockCode: relation.stockCode,
        relationType: relation.relationType,
        confidence: relation.confidence,
        evidenceCount: relation.evidenceCount,
        layoutSeed: stableSeed(companyId),
      };
      companies.set(relation.stockCode, company);
      nodes.push(company);
    }
    edges.push({
      id: `category:${relation.categoryId}->${companyId}`,
      source: `category:${relation.categoryId}`,
      target: companyId,
      kind: "relation",
      relationType: relation.relationType,
      confidence: relation.confidence,
      evidenceCount: relation.evidenceCount,
    });
  }

  return {
    nodes,
    edges,
    stats: {
      categoryCount: nodes.filter((node) => node.kind === "category").length,
      companyCount: companies.size,
      evidenceCount: relations.reduce((sum, relation) => sum + relation.evidenceCount, 0),
    },
  };
}
```

- [ ] **Step 4: Run the adapter tests**

Run:

```bash
npm test -- tests/industry-graph/adapter.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit the graph model**

```bash
git add src/lib/industry-graph/types.ts src/lib/industry-graph/adapter.ts tests/industry-graph/adapter.test.ts
git commit -m "feat: add industry graph adapter"
```

## Task 2: Graph Repository and API

**Files:**
- Create: `src/lib/repositories/industryGraph.ts`
- Create: `src/app/api/industry-graph/route.ts`
- Create: `tests/repositories/industryGraph.test.ts`

- [ ] **Step 1: Write the failing repository test**

```ts
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { listIndustryGraphRelations } from "@/lib/repositories/industryGraph";

describe("industry graph repository", () => {
  it("returns one row per relation with evidence counts", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    seedSemiconductorData(db);

    const rows = listIndustryGraphRelations(db);
    const sample = rows.find((row) => row.stockCode === "300346");

    expect(sample).toMatchObject({ shortName: "南大光电" });
    expect(sample?.evidenceCount).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the repository test and verify failure**

Run:

```bash
npm test -- tests/repositories/industryGraph.test.ts
```

Expected: FAIL because `listIndustryGraphRelations` does not exist.

- [ ] **Step 3: Add the aggregate query**

```ts
// src/lib/repositories/industryGraph.ts
import type Database from "better-sqlite3";
import type { IndustryGraphRelationRow } from "@/lib/industry-graph/types";

export function listIndustryGraphRelations(db: Database.Database) {
  return db.prepare(`
    select
      relation.category_id as categoryId,
      relation.stock_code as stockCode,
      company.short_name as shortName,
      relation.relation_type as relationType,
      relation.confidence as confidence,
      count(evidence.id) as evidenceCount
    from company_category_relations relation
    join companies company on company.stock_code = relation.stock_code
    join categories category on category.id = relation.category_id and category.is_active = 1
    left join evidences evidence on evidence.relation_id = relation.id and evidence.is_expired = 0
    group by relation.id
    order by relation.category_id, relation.stock_code
  `).all() as IndustryGraphRelationRow[];
}
```

- [ ] **Step 4: Add the read-only API route**

```ts
// src/app/api/industry-graph/route.ts
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { buildIndustryGraph } from "@/lib/industry-graph/adapter";
import { getCategoryTree } from "@/lib/repositories/categories";
import { listIndustryGraphRelations } from "@/lib/repositories/industryGraph";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDatabase();
  const graph = buildIndustryGraph(getCategoryTree(db), listIndustryGraphRelations(db));
  return NextResponse.json(graph, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=300" },
  });
}
```

- [ ] **Step 5: Run repository and existing tests**

Run:

```bash
npm test -- tests/repositories/industryGraph.test.ts tests/industry-graph/adapter.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 6: Commit the graph endpoint**

```bash
git add src/lib/repositories/industryGraph.ts src/app/api/industry-graph/route.ts tests/repositories/industryGraph.test.ts
git commit -m "feat: expose industry graph data"
```

## Task 3: Deterministic 3D Layout and Quality Tiers

**Files:**
- Create: `src/lib/industry-graph/layout.ts`
- Create: `tests/industry-graph/layout.test.ts`

- [ ] **Step 1: Write failing layout tests**

```ts
import { describe, expect, it } from "vitest";
import { chooseGraphQuality, createGraphLayout } from "@/lib/industry-graph/layout";
import type { IndustryGraphPayload } from "@/lib/industry-graph/types";

const graph: IndustryGraphPayload = {
  nodes: [
    { id: "category:1", kind: "category", label: "半导体", categoryId: 1, parentId: null, level: 0, layoutSeed: 1 },
    { id: "category:2", kind: "category", label: "封测", categoryId: 2, parentId: 1, level: 1, layoutSeed: 2 },
    { id: "company:002156", kind: "company", label: "通富微电", stockCode: "002156", relationType: "主营业务", confidence: "高", evidenceCount: 12, layoutSeed: 3 },
  ],
  edges: [
    { id: "category:1->category:2", source: "category:1", target: "category:2", kind: "hierarchy", evidenceCount: 0 },
    { id: "category:2->company:002156", source: "category:2", target: "company:002156", kind: "relation", relationType: "主营业务", confidence: "高", evidenceCount: 12 },
  ],
  stats: { categoryCount: 2, companyCount: 1, evidenceCount: 12 },
};

describe("industry graph layout", () => {
  it("returns stable finite positions", () => {
    const first = createGraphLayout(graph);
    const second = createGraphLayout(graph);
    expect(first).toEqual(second);
    expect(first["category:1"]).toEqual([0, 0, 0]);
    expect(first["company:002156"].every(Number.isFinite)).toBe(true);
  });

  it("chooses a reduced tier for constrained devices", () => {
    expect(chooseGraphQuality({ hardwareConcurrency: 2, deviceMemory: 2, reducedMotion: false })).toMatchObject({
      tier: "reduced",
      particlesPerEdge: 0,
      pixelRatio: 1,
    });
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
npm test -- tests/industry-graph/layout.test.ts
```

Expected: FAIL because `layout.ts` does not exist.

- [ ] **Step 3: Implement deterministic layout and quality selection**

```ts
// src/lib/industry-graph/layout.ts
import type { IndustryGraphPayload } from "./types";

export type GraphPosition = [number, number, number];
export type GraphQuality = {
  tier: "full" | "balanced" | "reduced";
  particlesPerEdge: number;
  maxLabels: number;
  pixelRatio: number;
};

function seededUnit(seed: number) {
  return ((Math.imul(seed ^ (seed >>> 16), 2246822519) >>> 0) % 10000) / 10000;
}

export function createGraphLayout(graph: IndustryGraphPayload): Record<string, GraphPosition> {
  const positions: Record<string, GraphPosition> = {};
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const categoryEdges = graph.edges.filter((edge) => edge.kind === "hierarchy");
  const relationEdges = graph.edges.filter((edge) => edge.kind === "relation");
  const roots = graph.nodes.filter((node) => node.kind === "category" && node.parentId === null);

  roots.forEach((root, rootIndex) => {
    positions[root.id] = rootIndex === 0 ? [0, 0, 0] : [rootIndex * 18, 0, 0];
  });

  for (let depth = 1; depth <= 8; depth += 1) {
    const children = categoryEdges.filter((edge) => nodeById.get(edge.target)?.kind === "category" && nodeById.get(edge.target)?.level === depth);
    children.forEach((edge, index) => {
      const parent = positions[edge.source] ?? [0, 0, 0];
      const node = nodeById.get(edge.target)!;
      const angle = seededUnit(node.layoutSeed) * Math.PI * 2 + index * 0.7;
      const radius = Math.max(3.2, 8 - depth * 0.8);
      positions[node.id] = [parent[0] + Math.cos(angle) * radius, parent[1] + (seededUnit(node.layoutSeed + 1) - 0.5) * 4, parent[2] + Math.sin(angle) * radius];
    });
  }

  relationEdges.forEach((edge, index) => {
    const parent = positions[edge.source] ?? [0, 0, 0];
    const node = nodeById.get(edge.target)!;
    if (positions[node.id]) return;
    const angle = seededUnit(node.layoutSeed) * Math.PI * 2 + index * 0.31;
    positions[node.id] = [parent[0] + Math.cos(angle) * 3.2, parent[1] + (seededUnit(node.layoutSeed + 7) - 0.5) * 3, parent[2] + Math.sin(angle) * 3.2];
  });

  return positions;
}

export function chooseGraphQuality(input: { hardwareConcurrency: number; deviceMemory?: number; reducedMotion: boolean }): GraphQuality {
  if (input.reducedMotion || input.hardwareConcurrency <= 2 || (input.deviceMemory ?? 4) <= 2) {
    return { tier: "reduced", particlesPerEdge: 0, maxLabels: 24, pixelRatio: 1 };
  }
  if (input.hardwareConcurrency <= 6 || (input.deviceMemory ?? 8) <= 4) {
    return { tier: "balanced", particlesPerEdge: 1, maxLabels: 60, pixelRatio: 1.35 };
  }
  return { tier: "full", particlesPerEdge: 2, maxLabels: 120, pixelRatio: 1.75 };
}
```

- [ ] **Step 4: Run the layout tests**

Run:

```bash
npm test -- tests/industry-graph/layout.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit layout logic**

```bash
git add src/lib/industry-graph/layout.ts tests/industry-graph/layout.test.ts
git commit -m "feat: add deterministic graph layout"
```

## Task 4: Mode Switch and Shared Workbench State

**Files:**
- Create: `src/components/workbench/WorkbenchModeSwitch.tsx`
- Create: `src/components/atlas/IndustryAtlas.tsx`
- Create: `tests/components/workbenchModeSwitch.test.tsx`
- Modify: `src/components/workbench/types.ts`
- Modify: `src/components/workbench/Workbench.tsx`

- [ ] **Step 1: Write the failing mode-switch test**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkbenchModeSwitch } from "@/components/workbench/WorkbenchModeSwitch";

describe("WorkbenchModeSwitch", () => {
  it("exposes an accessible segmented control", () => {
    const onChange = vi.fn();
    render(<WorkbenchModeSwitch value="research" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "研究工作台" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "产业链星图" }));
    expect(onChange).toHaveBeenCalledWith("atlas");
  });
});
```

- [ ] **Step 2: Run the component test and verify failure**

Run:

```bash
npm test -- tests/components/workbenchModeSwitch.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Add the mode type and segmented control**

```ts
// append to src/components/workbench/types.ts
export type WorkbenchMode = "research" | "atlas";
```

```tsx
// src/components/workbench/WorkbenchModeSwitch.tsx
"use client";

import { Boxes, Telescope } from "lucide-react";
import type { WorkbenchMode } from "./types";

export function WorkbenchModeSwitch({ value, onChange }: { value: WorkbenchMode; onChange: (mode: WorkbenchMode) => void }) {
  return (
    <div className="mode-switch" aria-label="工作台模式">
      <button type="button" aria-pressed={value === "research"} onClick={() => onChange("research")}>
        <Boxes aria-hidden="true" />研究工作台
      </button>
      <button type="button" aria-pressed={value === "atlas"} onClick={() => onChange("atlas")}>
        <Telescope aria-hidden="true" />产业链星图
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Hoist mode and selected entity state in `Workbench`**

Add a typed loading shell that Task 6 will expand:

```tsx
// src/components/atlas/IndustryAtlas.tsx
"use client";

export type IndustryAtlasProps = {
  selectedCategoryId: number | null;
  selectedStockCode: string | null;
  refreshKey: number;
  onSelectCategory: (categoryId: number) => void;
  onSelectStock: (stockCode: string) => void;
  onOpenResearch: (stockCode: string) => void;
};

export function IndustryAtlas(_props: IndustryAtlasProps) {
  return <div className="atlas-loading" role="status">正在构建产业链星图</div>;
}
```

Add lazy atlas loading and preserve `selectedCategoryId` and `selectedStockCode` across both modes:

```tsx
import dynamic from "next/dynamic";
import type { WorkbenchMode } from "./types";
import { WorkbenchModeSwitch } from "./WorkbenchModeSwitch";

const IndustryAtlas = dynamic(() => import("@/components/atlas/IndustryAtlas").then((module) => module.IndustryAtlas), {
  ssr: false,
  loading: () => <div className="atlas-loading" role="status">正在构建产业链星图</div>,
});

const [mode, setMode] = useState<WorkbenchMode>("research");

useEffect(() => {
  const stored = window.localStorage.getItem("stock-classification:mode");
  if (stored === "atlas" || stored === "research") setMode(stored);
}, []);

const changeMode = (nextMode: WorkbenchMode) => {
  setMode(nextMode);
  window.localStorage.setItem("stock-classification:mode", nextMode);
};
```

Render `WorkbenchModeSwitch` in the header. Keep the existing three-column JSX under `mode === "research"` and render:

```tsx
<IndustryAtlas
  selectedCategoryId={selectedCategoryId}
  selectedStockCode={selectedStockCode}
  refreshKey={refreshKey}
  onSelectCategory={setSelectedCategoryId}
  onSelectStock={setSelectedStockCode}
  onOpenResearch={(stockCode) => {
    setSelectedStockCode(stockCode);
    changeMode("research");
  }}
/>
```

under `mode === "atlas"`.

- [ ] **Step 5: Run the mode-switch and type checks**

Run:

```bash
npm test -- tests/components/workbenchModeSwitch.test.tsx
npm run typecheck
```

Expected: component test and typecheck PASS.

- [ ] **Step 6: Commit the mode shell**

```bash
git add src/components/workbench/WorkbenchModeSwitch.tsx src/components/workbench/types.ts src/components/workbench/Workbench.tsx src/components/atlas/IndustryAtlas.tsx tests/components/workbenchModeSwitch.test.tsx
git commit -m "feat: add workbench atlas mode"
```

## Task 5: Install Three.js and Build the Scene

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/components/atlas/IndustryGraphScene.tsx`

- [ ] **Step 1: Install the rendering dependency**

Run:

```bash
npm install three@0.169.0
```

Expected: `three` appears in dependencies and the lockfile updates.

- [ ] **Step 2: Implement the isolated Three.js scene**

`IndustryGraphScene` must:

- create one renderer, one CSS label renderer, one camera, and one controls instance;
- use `createGraphLayout(graph)` and `chooseGraphQuality(...)`;
- build category and company meshes with `userData.nodeId`;
- build hierarchy and relation lines;
- add particles only when `particlesPerEdge > 0`;
- raycast on pointer movement and call `onSelectNode` on click;
- apply `focusedCategoryId` by dimming unrelated nodes;
- pause `requestAnimationFrame` while `document.hidden`;
- dispose geometries, materials, controls, renderers, observers, and listeners on unmount;
- expose a real canvas with `data-testid="industry-graph-canvas"`;
- call `onWebGlFailure` when context creation throws or the `webglcontextlost` event fires.
- create the renderer only when `graph` changes; focused category, selected node, and callbacks update through refs/runtime methods without rebuilding the renderer.

Use this public contract:

```tsx
export type IndustryGraphSceneProps = {
  graph: IndustryGraphPayload;
  focusedCategoryId: number | null;
  selectedNodeId: string | null;
  onSelectNode: (node: IndustryGraphNode) => void;
  onWebGlFailure: () => void;
};

type GraphSceneRuntime = {
  setInteractionState: (state: Pick<IndustryGraphSceneProps, "focusedCategoryId" | "selectedNodeId">) => void;
  dispose: () => void;
};

export function IndustryGraphScene({ graph, focusedCategoryId, selectedNodeId, onSelectNode, onWebGlFailure }: IndustryGraphSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<GraphSceneRuntime | null>(null);
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;

  useEffect(() => {
    if (!hostRef.current) return;
    const runtime = mountIndustryGraphScene(hostRef.current, graph, (node) => onSelectNodeRef.current(node), onWebGlFailure);
    runtimeRef.current = runtime;
    return () => {
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, [graph, onWebGlFailure]);

  useEffect(() => {
    runtimeRef.current?.setInteractionState({ focusedCategoryId, selectedNodeId });
  }, [focusedCategoryId, selectedNodeId]);

  return <div ref={hostRef} className="industry-graph-scene" data-testid="industry-graph-canvas-host" />;
}
```

Keep the imperative setup in a file-local `mountIndustryGraphScene` function. Build label DOM nodes with `textContent`, never `innerHTML`.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit the scene**

```bash
git add package.json package-lock.json src/components/atlas/IndustryGraphScene.tsx
git commit -m "feat: render interactive 3d industry graph"
```

## Task 6: Atlas Navigation, Snapshot, Fetching, and Fallback

**Files:**
- Create: `src/components/atlas/AtlasLayerNav.tsx`
- Create: `src/components/atlas/AtlasCompanySnapshot.tsx`
- Create: `src/components/atlas/GraphFallback.tsx`
- Modify: `src/components/atlas/IndustryAtlas.tsx`
- Create: `tests/components/atlasCompanySnapshot.test.tsx`

- [ ] **Step 1: Write failing compact-snapshot tests**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AtlasCompanySnapshot } from "@/components/atlas/AtlasCompanySnapshot";

describe("AtlasCompanySnapshot", () => {
  it("renders an immediate compact company summary", () => {
    render(
      <AtlasCompanySnapshot
        stockCode="002156"
        state={{
          status: "ready",
          company: { shortName: "通富微电", board: "深市主板", industry: "封装测试", intro: "国内领先的封装测试企业。", mainBusiness: "封装测试收入占比 86%。" },
          relations: [],
          evidenceCount: 12,
        }}
        onOpenResearch={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: "通富微电" })).toBeVisible();
    expect(screen.getByText("国内领先的封装测试企业。")).toBeVisible();
    expect(screen.getByText("12")).toBeVisible();
  });

  it("shows a non-blocking completion state", () => {
    render(<AtlasCompanySnapshot stockCode="002156" state={{ status: "loading" }} onOpenResearch={() => undefined} />);
    expect(screen.getByText("资料补全中")).toBeVisible();
    expect(screen.getByRole("button", { name: "进入公司研究详情" })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
npm test -- tests/components/atlasCompanySnapshot.test.tsx
```

Expected: FAIL because `AtlasCompanySnapshot` does not exist.

- [ ] **Step 3: Build the compact snapshot**

Define:

```ts
export type AtlasCompanyState =
  | { status: "idle" | "loading" }
  | {
      status: "ready";
      company: Pick<Company, "shortName" | "board" | "industry" | "intro" | "mainBusiness">;
      relations: Array<{ categoryName: string; relationType: string; confidence: string }>;
      evidenceCount: number;
    }
  | { status: "error"; message: string };
```

Render only:

- heading and one-line market/industry metadata;
- up to three chips;
- one-sentence positioning;
- extracted main-business share or “占比待补”;
- relation score derived from relation type and confidence;
- evidence count;
- up to two short competitive-advantage phrases;
- enabled “进入公司研究详情” button in every non-idle state.

Use `line-clamp` and title attributes for truncated content. Do not render paragraphs longer than three lines.

- [ ] **Step 4: Build layer navigation and accessible fallback**

`AtlasLayerNav` receives category nodes from the graph and emits a category ID. `GraphFallback` renders category groups and company buttons using the same `onSelectNode` callback as the scene. Both components must use semantic buttons and visible keyboard focus.

- [ ] **Step 5: Replace the temporary atlas shell**

`IndustryAtlas` should:

```tsx
const [graphState, setGraphState] = useState<
  | { status: "loading" }
  | { status: "ready"; graph: IndustryGraphPayload }
  | { status: "error"; message: string }
>({ status: "loading" });
const [webGlFailed, setWebGlFailed] = useState(false);
const [companyState, setCompanyState] = useState<AtlasCompanyState>({ status: "idle" });
```

Fetch `/api/industry-graph` on mount and whenever `refreshKey` changes. When a company node is selected:

1. call `onSelectStock(stockCode)` immediately;
2. set snapshot status to `loading`;
3. fetch `/api/companies/${stockCode}`;
4. map the existing response into `AtlasCompanyState`;
5. retain the selected node if the detail request fails.

Render `GraphFallback` when WebGL fails. Use `AbortController` in both effects so stale responses cannot replace a newer selection.

- [ ] **Step 6: Run component tests and typecheck**

Run:

```bash
npm test -- tests/components/atlasCompanySnapshot.test.tsx
npm run typecheck
```

Expected: all tests PASS.

- [ ] **Step 7: Commit the atlas UI**

```bash
git add src/components/atlas/AtlasLayerNav.tsx src/components/atlas/AtlasCompanySnapshot.tsx src/components/atlas/GraphFallback.tsx src/components/atlas/IndustryAtlas.tsx tests/components/atlasCompanySnapshot.test.tsx
git commit -m "feat: add atlas navigation and company snapshot"
```

## Task 7: Visual System, Responsive Layout, and Motion Controls

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/workbench/Workbench.tsx`
- Modify: `src/components/workbench/WorkbenchToolbar.tsx`
- Modify: `src/components/workbench/ClassificationTree.tsx`
- Modify: `src/components/workbench/StockTable.tsx`
- Modify: `src/components/workbench/CompanyDetails.tsx`

- [ ] **Step 1: Add shared visual tokens**

Add CSS variables for ink, panel, mint, cyan, amber, danger, text, and muted tones. Use them in both modes:

```css
:root {
  --terminal-ink: #050908;
  --terminal-panel: rgba(8, 18, 16, 0.92);
  --terminal-line: rgba(94, 205, 176, 0.22);
  --terminal-mint: #5fffd0;
  --terminal-cyan: #58d6ff;
  --terminal-amber: #ffc45c;
  --terminal-danger: #ff6e6e;
  --paper: #f3f7f5;
  --paper-panel: rgba(255, 255, 252, 0.94);
}
```

Use the dark palette for the atlas. Use pale technical-paper panels with dark green chrome and mint focus states for research mode, preserving the current information density.

- [ ] **Step 2: Implement scene chrome and micro-interactions**

Add styles for:

- full-bleed `.industry-atlas` and `.industry-graph-scene`;
- fixed top bar, left layer navigation, right snapshot, bottom status strip;
- 8px maximum card radius;
- 160–220ms hover and press feedback;
- selected node and data-sync status;
- loading skeleton that does not shift layout;
- mode cross-fade that changes opacity and transform only;
- stable dimensions for all icon buttons and segmented controls.

- [ ] **Step 3: Add responsive and reduced-motion behavior**

```css
@media (max-width: 900px) {
  .atlas-layer-nav { position: absolute; inset: auto 12px 12px; max-height: 42vh; }
  .atlas-company-snapshot { position: absolute; inset: auto 12px 12px; max-height: 56vh; }
  .atlas-bottom-status { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Use a bottom sheet state on mobile so the layer navigation and company snapshot never overlap.

- [ ] **Step 4: Run static checks**

Run:

```bash
npm run lint
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit the visual system**

```bash
git add src/app/globals.css src/components/workbench/Workbench.tsx src/components/workbench/WorkbenchToolbar.tsx src/components/workbench/ClassificationTree.tsx src/components/workbench/StockTable.tsx src/components/workbench/CompanyDetails.tsx
git commit -m "feat: apply industry intelligence visual system"
```

## Task 8: End-to-End Interaction and Canvas Verification

**Files:**
- Modify: `tests/e2e/workbench.spec.ts`

- [ ] **Step 1: Add an end-to-end atlas flow**

```ts
test("explores the industry atlas and returns to company research", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "产业链星图" }).click();

  await expect(page.getByTestId("industry-graph-canvas-host")).toBeVisible({ timeout: 2000 });
  await expect(page.getByText(/个分类节点/)).toBeVisible();
  await page.getByTestId("atlas-layer-nav").getByRole("button", { name: "封测" }).click();
  await page.getByTestId("atlas-node-list").getByRole("button", { name: "通富微电" }).click();

  await expect(page.getByRole("heading", { name: "通富微电" })).toBeVisible();
  await expect(page.getByText("一句话定位")).toBeVisible();
  await page.getByRole("button", { name: "进入公司研究详情" }).click();

  await expect(page.getByRole("button", { name: "研究工作台" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "通富微电" })).toBeVisible();
});
```

Expose an accessible off-canvas node list inside `IndustryGraphScene` for keyboard users and E2E interaction; keep it visually hidden but synchronized with scene selection.

- [ ] **Step 2: Add WebGL fallback coverage**

Add a test-only query flag `?atlasFallback=1` that makes `IndustryAtlas` choose `GraphFallback` only when `process.env.NODE_ENV !== "production"`. Verify the fallback lists categories and companies and still opens research details.

- [ ] **Step 3: Run targeted E2E tests**

Run:

```bash
npm run test:e2e -- --grep "industry atlas|workbench"
```

Expected: atlas and existing workbench flows PASS.

- [ ] **Step 4: Verify real rendering in the in-app browser**

Start the app:

```bash
npm run dev
```

Open the reported localhost URL and verify:

- desktop viewport at 1440×900;
- mobile viewport at 390×844;
- the canvas contains non-background pixels;
- initial atlas controls become interactive in under 2 seconds after switching modes;
- drag changes the camera, wheel changes zoom, and reset restores the camera;
- node labels do not cover the top bar, side panels, or each other at the initial view;
- selecting a company updates the right panel immediately;
- no console errors occur during repeated mode switching;
- the animation pauses when the tab becomes hidden.

- [ ] **Step 5: Run the full verification suite**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Expected: all commands PASS.

- [ ] **Step 6: Commit E2E coverage**

```bash
git add tests/e2e/workbench.spec.ts
git commit -m "test: cover 3d industry atlas workflow"
```

## Task 9: Final Performance and Regression Review

**Files:**
- Modify only files implicated by measurements or regressions from the checks below.

- [ ] **Step 1: Measure the atlas chunk boundary**

Run:

```bash
npm run build
```

Confirm from the build output and generated chunks that `three` is not part of the initial research-workbench route execution before the atlas dynamic import is requested.

- [ ] **Step 2: Inspect renderer cleanup**

Switch between research and atlas modes ten times in the browser. Confirm only one canvas exists in atlas mode and none exists in research mode:

```js
document.querySelectorAll("canvas").length
```

Expected: `1` in atlas mode, `0` in research mode.

- [ ] **Step 3: Inspect runtime responsiveness**

Use a seeded graph with at least 50 category nodes and 300 company nodes. Confirm:

- scene interaction remains responsive;
- quality tier reduces labels and particles on constrained emulation;
- selecting companies does not recreate the renderer;
- graph refresh updates scene data without accumulating event listeners.

- [ ] **Step 4: Run final regression commands**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
git status --short
```

Expected: all checks PASS; `git status --short` contains only pre-existing unrelated changes or is clean for atlas-owned files.

- [ ] **Step 5: Commit any measurement-driven fixes**

Stage only the atlas-related files changed during this task:

```bash
git add src/components/atlas src/lib/industry-graph src/app/api/industry-graph src/app/globals.css tests
git commit -m "perf: finalize 3d industry atlas"
```

Skip this commit when no fixes were needed.
