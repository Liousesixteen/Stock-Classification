// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccountActions } from "@/components/workbench/WorkspaceAccountActions";

describe("WorkspaceAccountActions", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("summarizes tasks and routes account shortcuts", async () => {
    const onOpenQueue = vi.fn();
    const onOpenAccount = vi.fn();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      deepseekConfigured: true,
      model: "deepseek-chat",
      profileProvidersEnabled: true,
    }), { status: 200 }))));

    render(createElement(WorkspaceAccountActions, {
      queue: { attention: 135, running: 2 },
      queueOpen: false,
      accountActive: false,
      onOpenQueue,
      onOpenAccount,
    }));

    expect(screen.getByRole("button", { name: "打开任务中心，135 项待处理" })).toHaveTextContent("99+");
    fireEvent.click(screen.getByRole("button", { name: "打开账户与设置" }));

    expect(screen.getByRole("dialog", { name: "账户与设置" })).toBeVisible();
    expect(screen.getByText("135 项待处理")).toBeVisible();
    expect(screen.getByText("进行中").parentElement).toHaveTextContent("2");
    expect(await screen.findByText("deepseek-chat")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /数据与模型/ }));
    expect(onOpenAccount).toHaveBeenCalledWith("data");
    expect(screen.queryByRole("dialog", { name: "账户与设置" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开任务中心，135 项待处理" }));
    expect(onOpenQueue).toHaveBeenCalledOnce();
  });

  it("closes with Escape", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    render(createElement(WorkspaceAccountActions, {
      queue: { attention: 0, running: 0 },
      queueOpen: false,
      accountActive: false,
      onOpenQueue: vi.fn(),
      onOpenAccount: vi.fn(),
    }));

    fireEvent.click(screen.getByRole("button", { name: "打开账户与设置" }));
    expect(screen.getByRole("dialog", { name: "账户与设置" })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "账户与设置" })).not.toBeInTheDocument();
  });
});
