// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchIntelligenceDock } from "@/components/workbench/ResearchIntelligenceDock";

const baseProps = {
  stockCode: "600030",
  companyName: "中信证券",
  categoryId: null,
  tab: "agents" as const,
  onTabChange: vi.fn(),
  onClose: vi.fn(),
  embedded: true,
  onTargetChange: vi.fn(),
};

describe("ResearchIntelligenceDock", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows three bounded research modes and honest evidence empty states", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ run: null, report: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));

    render(createElement(ResearchIntelligenceDock, baseProps));

    expect(await screen.findByRole("heading", { name: "AI 研究" })).toBeVisible();
    expect(screen.getByRole("button", { name: "快速问答" })).toBeVisible();
    expect(screen.getByRole("button", { name: "标准研究" })).toBeVisible();
    expect(screen.getByRole("button", { name: "深度研究" })).toBeVisible();
    expect(screen.getByRole("button", { name: "数据分析" })).toBeDisabled();
    expect(screen.getByText("运行后显示真实引用")).toBeVisible();
    expect(screen.getByText("当前目标尚无已完成研究")).toBeVisible();
    expect(screen.queryByText("关键指标趋势")).not.toBeInTheDocument();
    expect(screen.queryByText("AI 2024-2026 半导体周期展望")).not.toBeInTheDocument();
  });

  it("falls back from the stock index to an exact industry target", async () => {
    const onTargetChange = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/stocks/lookup")) {
        return new Response(JSON.stringify({ error: "未匹配到 A 股股票" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/categories") {
        return new Response(JSON.stringify({
          categories: [{
            id: 12,
            name: "半导体",
            aliases: ["芯片"],
            industry: "电子",
            children: [],
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ run: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(createElement(ResearchIntelligenceDock, {
      ...baseProps,
      stockCode: null,
      companyName: "",
      onTargetChange,
    }));

    const targetInput = screen.getByPlaceholderText("输入公司代码或名称");
    fireEvent.change(targetInput, { target: { value: "半导体" } });
    fireEvent.keyDown(targetInput, { key: "Enter" });

    await waitFor(() => expect(onTargetChange).toHaveBeenCalledWith(expect.objectContaining({
      targetType: "industry",
      subjectKey: "12",
      companyName: "半导体",
      categoryId: 12,
    })));
    expect(screen.getByText("电子")).toBeVisible();
  });
});
