// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchWorkbench } from "@/components/workbench/ResearchWorkbench";

vi.mock("@/components/workbench/CompanyDetails", () => ({ CompanyDetails: () => null }));
vi.mock("@/components/workbench/ImportDialog", () => ({ ImportDialog: () => null }));
vi.mock("@/components/workbench/ExportDialog", () => ({ ExportDialog: () => null }));
vi.mock("@/components/workbench/QualityPanel", () => ({ QualityPanel: () => null }));
vi.mock("@/components/workbench/ResearchIntelligenceDock", () => ({
  ResearchIntelligenceDock: ({ tab, onTabChange }: { tab: string; onTabChange: (tab: string) => void }) => createElement(
    "div",
    { "data-testid": "universal-ai-dock" },
    tab,
    tab === "agents" ? createElement("button", { type: "button", onClick: () => onTabChange("report") }, "转入报告工坊") : null,
  ),
}));

const queue = {
  items: [{
    relationId: 1,
    stockCode: "600030",
    shortName: "中信证券",
    categoryId: 10,
    categoryName: "证券",
    relationType: "主营业务",
    confidence: "高",
    evidenceCount: 1,
    hasResearchProfile: true,
    isWatchlist: true,
    updatedAt: "2026-07-13",
    reasons: ["已关注"],
    priority: 50,
  }],
  stats: { 已关注: 1, 待复核: 0, 缺证据: 0, 待建档: 0 },
};
const dashboard = {
  mode: "active",
  stats: {
    catalogCompanies: 1,
    activeCompanies: 1,
    activeCategories: 1,
    researchProfiles: 1,
    effectiveEvidence: 1,
    reports: 0,
    aiRuns: 0,
    openTasks: 1,
    watchlist: 1,
  },
  companies: [{
    stockCode: "600030",
    shortName: "中信证券",
    categoryId: 10,
    categoryName: "证券",
    evidenceCount: 1,
    hasResearchProfile: true,
    isWatchlist: true,
    isStarterExample: false,
    updatedAt: "2026-07-13",
  }],
  recentArtifacts: [],
};

describe("ResearchWorkbench", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens on a dedicated research command center instead of the company execution view", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/research-queue")) return Promise.resolve(new Response(JSON.stringify({ queue }), { status: 200 }));
      if (url.includes("/api/research-dashboard")) return Promise.resolve(new Response(JSON.stringify(dashboard), { status: 200 }));
      if (url.includes("/api/quality")) return Promise.resolve(new Response(JSON.stringify({ checks: [] }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    }));
    const onSelectCompany = vi.fn();

    render(createElement(ResearchWorkbench, {
      selectedCategoryId: null,
      selectedStockCode: null,
      refreshKey: 0,
      onSelectCompany,
      onOpenAtlas: vi.fn(),
      onOpenSector: vi.fn(),
      onChanged: vi.fn(),
    }));

    expect(await screen.findByRole("heading", { name: "研究工作台总览" })).toBeVisible();
    expect(screen.getByRole("button", { name: /AI 研究/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "产业链图谱" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "研究行动" })).not.toBeInTheDocument();
    expect(screen.queryByText("半导体细分树")).not.toBeInTheDocument();
    const queueItem = await screen.findByRole("button", { name: "继续研究 中信证券" });
    fireEvent.click(queueItem);
    expect(onSelectCompany).toHaveBeenCalledWith("600030", 10);
  });

  it("opens universal AI tools without requiring a selected queue company", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/api/research-queue")) return Promise.resolve(new Response(JSON.stringify({ queue }), { status: 200 }));
      if (String(input).includes("/api/research-dashboard")) return Promise.resolve(new Response(JSON.stringify(dashboard), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    }));

    render(createElement(ResearchWorkbench, {
      selectedCategoryId: null,
      selectedStockCode: null,
      refreshKey: 0,
      onSelectCompany: vi.fn(),
      onOpenAtlas: vi.fn(),
      onOpenSector: vi.fn(),
      onChanged: vi.fn(),
    }));

    const askButton = await screen.findByRole("button", { name: /AI 研究/ });
    expect(askButton).toBeEnabled();

    fireEvent.click(askButton);
    expect(screen.getByTestId("universal-ai-dock")).toHaveTextContent("agents");
    expect(screen.queryByRole("heading", { name: "研究行动" })).not.toBeInTheDocument();

    const reportButton = screen.getByRole("button", { name: "转入报告工坊" });
    expect(reportButton).toBeEnabled();
    fireEvent.click(reportButton);
    expect(screen.getByTestId("universal-ai-dock")).toHaveTextContent("report");
  });
});
