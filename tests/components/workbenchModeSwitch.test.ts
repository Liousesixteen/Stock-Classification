// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { WorkbenchModeSwitch } from "@/components/workbench/WorkbenchModeSwitch";

describe("WorkbenchModeSwitch", () => {
  it("exposes the unified research navigation from every workspace", () => {
    const onChange = vi.fn();
    const onOpenQueue = vi.fn();
    const { rerender } = render(createElement(WorkbenchModeSwitch, { value: "research", onChange, onOpenQueue }));
    expect(screen.getByRole("button", { name: "研究工作台" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "产业链图谱" })).toBeVisible();
    expect(screen.getByRole("button", { name: "成果库" })).toBeVisible();
    expect(screen.getByRole("button", { name: "任务中心" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "产业链图谱" }));
    expect(onChange).toHaveBeenCalledWith("atlas");

    fireEvent.click(screen.getByRole("button", { name: "成果库" }));
    expect(onChange).toHaveBeenCalledWith("results");

    rerender(createElement(WorkbenchModeSwitch, { value: "atlas", onChange, onOpenQueue }));
    expect(screen.getByRole("button", { name: "产业链图谱" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "任务中心" }));
    expect(onOpenQueue).toHaveBeenCalledOnce();
  });
});
