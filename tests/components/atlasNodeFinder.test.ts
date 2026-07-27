// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AtlasNodeFinder } from "@/components/atlas/AtlasNodeFinder";
import type { IndustryGraphNode } from "@/lib/industry-graph/types";

afterEach(cleanup);

const nodes: IndustryGraphNode[] = [
  { id: "category:1", kind: "category", categoryId: 1, label: "封测", level: 0, parentId: null, layoutSeed: 1 },
  { id: "company:002156", kind: "company", stockCode: "002156", label: "通富微电", relationType: "主营业务", confidence: "高", evidenceCount: 1, layoutSeed: 2 },
];

describe("AtlasNodeFinder", () => {
  it("finds and selects a company by stock code", () => {
    const onSelect = vi.fn();
    render(createElement(AtlasNodeFinder, { nodes, onSelect }));

    fireEvent.change(screen.getByRole("textbox", { name: "定位产业或公司" }), { target: { value: "002156" } });
    fireEvent.click(screen.getByRole("option", { name: /通富微电/ }));

    expect(onSelect).toHaveBeenCalledWith(nodes[1]);
    expect(screen.getByRole("textbox", { name: "定位产业或公司" })).toHaveValue("");
  });
});
