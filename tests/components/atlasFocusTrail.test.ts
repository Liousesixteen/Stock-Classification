// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AtlasFocusTrail } from "@/components/atlas/AtlasFocusTrail";

afterEach(cleanup);

describe("AtlasFocusTrail", () => {
  it("shows the industry path and supports returning to a parent view", () => {
    const onBack = vi.fn();
    const onReset = vi.fn();
    render(createElement(AtlasFocusTrail, { labels: ["半导体", "封测"], categoryCount: 4, companyCount: 12, onBack, onReset }));

    expect(screen.getByLabelText("当前图谱聚焦路径")).toHaveTextContent("半导体");
    expect(screen.getByLabelText("当前图谱聚焦路径")).toHaveTextContent("封测");
    expect(screen.queryByText("FOCUS MODE")).not.toBeInTheDocument();
    expect(screen.queryByText("局部星图")).not.toBeInTheDocument();
    expect(screen.getByText("4 个环节")).toBeVisible();
    expect(screen.getByText("封测").closest("span")).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "返回上层" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
