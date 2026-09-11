// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { RichWorkbenchWorkspace } from "@/components/workbench/RichWorkbenchWorkspace";

describe("RichWorkbenchWorkspace technical analysis tabs", () => {
  it("places wave theory after strategy backtest and opens the integrated module", () => {
    render(createElement(RichWorkbenchWorkspace));
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map(tab => tab.textContent)).toEqual(["市场观察", "策略回测", "波浪理论"]);

    fireEvent.click(screen.getByRole("tab", { name: "波浪理论" }));
    expect(screen.getByRole("tab", { name: "波浪理论" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "运行波浪分析" })).toBeVisible();
    expect(screen.getByText("真实前复权日线 · ZigZag 转折 · 显式规则校验")).toBeVisible();
  });
});
