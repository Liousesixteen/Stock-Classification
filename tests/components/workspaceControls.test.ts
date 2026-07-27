// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResizablePanelControls, useResizablePanelLayout } from "@/components/workbench/ResizablePanelControls";
import { WorkspaceState } from "@/components/workbench/WorkspaceState";

const leftPanel = { defaultWidth: 220, minWidth: 176, maxWidth: 310 };
const rightPanel = { defaultWidth: 236, minWidth: 200, maxWidth: 340 };

function PanelHarness() {
  const controls = useResizablePanelLayout("test-panel-layout", leftPanel, rightPanel);
  return createElement(
    "section",
    { "data-testid": "panel-layout", style: controls.style },
    createElement(ResizablePanelControls, {
      layout: controls.layout,
      bounds: controls.bounds,
      onResize: controls.resize,
      onResizeByKeyboard: controls.resizeByKeyboard,
      onToggle: controls.toggle,
    }),
  );
}

describe("workspace controls", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("collapses, resizes, and restores panel preferences", async () => {
    render(createElement(PanelHarness));
    fireEvent.click(screen.getByRole("button", { name: "折叠左侧栏" }));
    fireEvent.keyDown(screen.getByRole("separator", { name: "调整右侧栏宽度" }), { key: "ArrowLeft" });

    expect(screen.getByTestId("panel-layout")).toHaveStyle("--workspace-left-panel: 0px");
    expect(screen.getByTestId("panel-layout")).toHaveStyle("--workspace-right-panel: 248px");
    await waitFor(() => expect(window.localStorage.getItem("test-panel-layout")).toContain("\"leftCollapsed\":true"));

    cleanup();
    render(createElement(PanelHarness));
    await waitFor(() => expect(screen.getByRole("button", { name: "展开左侧栏" })).toBeVisible());
    expect(screen.getByTestId("panel-layout")).toHaveStyle("--workspace-right-panel: 248px");
  });

  it("provides a contextual retry action for recoverable errors", () => {
    const retry = vi.fn();
    render(createElement(WorkspaceState, {
      state: "error",
      title: "图谱加载失败",
      description: "数据服务暂时不可用。",
      onAction: retry,
    }));

    expect(screen.getByRole("alert")).toHaveTextContent("数据服务暂时不可用");
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
