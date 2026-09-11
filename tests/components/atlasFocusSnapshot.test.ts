// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AtlasFocusSnapshot } from "@/components/atlas/AtlasFocusSnapshot";
import type { IndustryGraphPayload } from "@/lib/industry-graph/types";

afterEach(cleanup);

const graph: IndustryGraphPayload = {
  nodes: [
    { id: "category:1", kind: "category", label: "半导体", categoryId: 1, parentId: null, level: 0, layoutSeed: 1 },
    { id: "company:600030", kind: "company", label: "中信证券", stockCode: "600030", relationType: "重要相关", confidence: "中", evidenceCount: 2, layoutSeed: 2 },
  ],
  edges: [
    { id: "category:1->company:600030", source: "category:1", target: "company:600030", kind: "relation", relationType: "重要相关", confidence: "中", evidenceCount: 2 },
  ],
  stats: { categoryCount: 1, companyCount: 1, evidenceCount: 2 },
};

describe("AtlasFocusSnapshot", () => {
  it("shows a compact industry overview without sector-research actions", () => {
    render(createElement(AtlasFocusSnapshot, {
      graph,
      focus: { categoryId: 1, labels: ["A股行业全景", "半导体"], categoryCount: 1, companyCount: 1, parentId: null },
      onSelectCompany: () => undefined,
    }));

    expect(screen.getByLabelText("半导体产业概览")).toBeVisible();
    expect(screen.getAllByText("关联公司")).toHaveLength(2);
    expect(screen.getByText("2 证据")).toBeVisible();
    expect(screen.getByText("查看公司星图")).toBeVisible();
    expect(screen.queryByText(/赛道研究/)).not.toBeInTheDocument();
  });
});
