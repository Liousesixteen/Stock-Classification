// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchQueue } from "@/components/queue/ResearchQueue";
import type { ResearchQueue as ResearchQueueData, ResearchQueueItem } from "@/lib/repositories/researchQueue";

const baseItem: ResearchQueueItem = {
  taskId: 1,
  taskType: "low_confidence",
  taskStatus: "open",
  taskTitle: "核验供应商关系",
  taskDescription: "当前关系缺少一手来源交叉验证。",
  targetType: "relation",
  sourceRef: "",
  fieldKey: "",
  evidenceId: null,
  reportId: null,
  canComplete: true,
  relationId: 12,
  stockCode: "002156",
  shortName: "通富微电",
  categoryId: 4,
  categoryName: "先进封装",
  relationType: "供应商",
  confidence: "中",
  evidenceCount: 1,
  fieldIssueCount: 0,
  failedFieldCount: 0,
  hasResearchProfile: true,
  isWatchlist: true,
  updatedAt: "2026-09-02T08:00:00.000Z",
  reasons: ["已关注", "待复核"],
  priority: 90,
};

const runningItem: ResearchQueueItem = {
  ...baseItem,
  taskId: 2,
  taskType: "sync_failure",
  taskStatus: "in_progress",
  taskTitle: "同步年度报告数据",
  canComplete: false,
  reasons: ["同步失败"],
};

const queue: ResearchQueueData = {
  items: [baseItem, runningItem],
  stats: { 已关注: 1, 待复核: 1, 缺证据: 0, 资料过期: 0, 待建档: 0, 同步失败: 1, 待补资料: 0, 成果待完善: 0 },
};

describe("ResearchQueue system drawer", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("groups system tasks and discloses details progressively", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ queue }), { status: 200 }))));
    render(createElement(ResearchQueue, { refreshKey: 0, onOpenCompany: vi.fn(), compact: true }));

    expect(await screen.findByRole("heading", { name: "系统任务" })).toBeVisible();
    expect(screen.getByText("需要处理")).toBeVisible();
    expect(screen.getByText("自动运行")).toBeVisible();
    expect(screen.queryByText("批量处理")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /核验供应商关系/ }));
    expect(screen.getByText("建议下一步")).toBeVisible();
    expect(screen.getByRole("button", { name: /打开精确位置/ })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /进行中 1/ }));
    expect(screen.queryByText("核验供应商关系")).not.toBeInTheDocument();
    expect(screen.getByText("同步年度报告数据")).toBeVisible();
  });

  it("falls back to the read-only queue endpoint when reconciliation fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "temporary" }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(queue), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(ResearchQueue, { refreshKey: 0, onOpenCompany: vi.fn(), compact: true }));

    expect(await screen.findByText("核验供应商关系")).toBeVisible();
    expect(screen.queryByText("任务暂时无法读取")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
