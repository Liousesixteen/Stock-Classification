// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AtlasControlDock } from "@/components/atlas/AtlasControlDock";
import type { IndustryGraphNode } from "@/lib/industry-graph/types";

afterEach(cleanup);

const nodes: IndustryGraphNode[] = [
  { id: "category:1", kind: "category", categoryId: 1, label: "半导体", level: 0, parentId: null, layoutSeed: 1 },
];

describe("AtlasControlDock", () => {
  it("keeps search and focus controls together while dragging", () => {
    const { container } = render(createElement(AtlasControlDock, {
      nodes,
      focus: { categoryId: 1, labels: ["半导体"], categoryCount: 1, companyCount: 0, parentId: null },
      onSelectNode: vi.fn(),
      onSelectCategory: vi.fn(),
    }));
    const handle = screen.getByRole("button", { name: "拖动聚焦控制台" });
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 145, clientY: 130 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(screen.getByRole("textbox", { name: "定位产业或公司" })).toBeVisible();
    expect(screen.getByLabelText("当前图谱聚焦路径")).toBeVisible();
    expect(container.firstElementChild).toHaveStyle("--atlas-dock-x: 0px");
  });
});
