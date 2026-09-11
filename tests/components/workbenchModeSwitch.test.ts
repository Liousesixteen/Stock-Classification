// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { WorkbenchModeSwitch } from "@/components/workbench/WorkbenchModeSwitch";

describe("WorkbenchModeSwitch", () => {
  it("exposes the final product navigation without legacy workspaces", () => {
    const onChange = vi.fn();
    const { rerender } = render(createElement(WorkbenchModeSwitch, { value: "atlas", onChange }));
    const primaryButtons = screen.getByLabelText("主要功能").querySelectorAll("button");
    expect(primaryButtons[0]).toHaveAccessibleName("市场工作台");
    expect(primaryButtons[1]).toHaveAccessibleName("星图");
    expect(screen.getByRole("button", { name: "星图" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "AI研判" })).toBeVisible();
    expect(screen.getByRole("button", { name: "研报生成" })).toBeVisible();
    expect(screen.getByRole("button", { name: "市场工作台" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "资讯" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "研究工作台" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "成果库" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI研判" }));
    expect(onChange).toHaveBeenCalledWith("ai");

    fireEvent.click(screen.getByRole("button", { name: "研报生成" }));
    expect(onChange).toHaveBeenCalledWith("report");

    fireEvent.click(screen.getByRole("button", { name: "市场工作台" }));
    expect(onChange).toHaveBeenCalledWith("rich");

    rerender(createElement(WorkbenchModeSwitch, { value: "rich", onChange }));
    expect(screen.getByRole("button", { name: "市场工作台" })).toHaveAttribute("aria-pressed", "true");
  });
});
