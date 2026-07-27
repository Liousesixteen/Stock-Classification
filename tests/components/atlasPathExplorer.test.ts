// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AtlasPathExplorer } from "@/components/atlas/AtlasPathExplorer";
import type { ResearchPath } from "@/lib/industry-graph/pathExplorer";

afterEach(cleanup);

const paths: ResearchPath[] = [
  {
    id: "company:1->entity:1",
    nodeIds: ["company:1", "entity:1"],
    edgeIds: ["edge:1"],
    nodes: [{ id: "company:1", label: "甲公司", kind: "company" }, { id: "entity:1", label: "先进封装", kind: "entity" }],
    evidenceCount: 2,
    independentSourceCount: 2,
    verification: "多源验证",
    nextAction: "路径已有多源支持，可继续评估订单。",
    score: 12,
  },
  {
    id: "company:1->category:1->company:2",
    nodeIds: ["company:1", "category:1", "company:2"],
    edgeIds: ["edge:2", "edge:3"],
    nodes: [{ id: "company:1", label: "甲公司", kind: "company" }, { id: "category:1", label: "封测", kind: "category" }, { id: "company:2", label: "乙公司", kind: "company" }],
    evidenceCount: 0,
    independentSourceCount: 0,
    verification: "缺证据",
    nextAction: "优先补充公告或年报证据。",
    score: 2,
  },
];

describe("AtlasPathExplorer", () => {
  it("filters explainable paths and activates the chosen chain", () => {
    const onActivatePath = vi.fn();
    render(createElement(AtlasPathExplorer, { paths, activePathId: null, onActivatePath }));

    expect(screen.getByRole("heading", { name: "关系推演" })).toBeVisible();
    expect(screen.getByText("先进封装")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /缺证据 1/ }));
    expect(screen.queryByText("先进封装")).not.toBeInTheDocument();
    const missingPath = screen.getByRole("button", { name: /甲公司.*封测.*乙公司/ });
    fireEvent.click(missingPath);
    expect(onActivatePath).toHaveBeenCalledWith(paths[1]);
  });
});
