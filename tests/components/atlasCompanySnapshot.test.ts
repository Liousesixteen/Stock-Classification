// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AtlasCompanySnapshot } from "@/components/atlas/AtlasCompanySnapshot";

afterEach(cleanup);

describe("AtlasCompanySnapshot", () => {
  it("renders a compact immediate company summary", () => {
    render(createElement(AtlasCompanySnapshot, {
      stockCode: "002156",
      state: {
        status: "ready",
        company: { stockCode: "002156", shortName: "通富微电", fullName: "", board: "深市主板", industry: "封装测试", region: "江苏", marketCapBand: "", intro: "国内领先的封装测试企业。", mainBusiness: "封装测试收入占比 86%。", updatedAt: "" },
        relations: [{ categoryName: "封测", relationType: "主营业务", confidence: "高" }],
        evidenceCount: 12,
        summary: "国内领先的封装测试企业。",
        advantages: ["先进封装技术积累"],
        quality: { overallScore: 88, fieldCoverageScore: 90, evidenceCoverageScore: 82, reliabilityLabel: "可靠" },
      },
      onOpenResearch: () => undefined,
    }));
    expect(screen.getByRole("heading", { name: "通富微电" })).toBeVisible();
    expect(screen.getByText("国内领先的封装测试企业。")).toBeVisible();
    expect(screen.getByText("12")).toBeVisible();
  });

  it("keeps research navigation enabled while details load", () => {
    render(createElement(AtlasCompanySnapshot, { stockCode: "002156", state: { status: "loading", name: "通富微电" }, onOpenResearch: () => undefined }));
    expect(screen.getByLabelText("资料补全中")).toBeVisible();
    expect(screen.getByRole("button", { name: /进入公司研究详情/ })).toBeEnabled();
  });

  it("explains a graph relationship and focuses its category on demand", () => {
    const onFocusCategory = vi.fn();
    render(createElement(AtlasCompanySnapshot, {
      stockCode: "002156",
      state: {
        status: "ready",
        company: { stockCode: "002156", shortName: "通富微电", fullName: "", board: "深市主板", industry: "封装测试", region: "江苏", marketCapBand: "", intro: "国内领先的封装测试企业。", mainBusiness: "封装测试。", updatedAt: "" },
        relations: [], evidenceCount: 1, summary: "国内领先的封装测试企业。", advantages: [],
        quality: { overallScore: 52, fieldCoverageScore: 60, evidenceCoverageScore: 35, reliabilityLabel: "待核验" },
      },
      graphRelations: [{ id: "category:2->company:002156", source: "category:2", target: "company:002156", kind: "relation", relationId: 9, categoryId: 2, categoryName: "封测", relationType: "主营业务", confidence: "高", evidenceCount: 1, rationale: "公司主营业务直接覆盖封装测试。", isWatchlist: false, direction: "outbound", strength: 86, observedAt: "2026-03-01", evidencePreviews: [{ id: 2, sourceType: "年报", title: "2025 年报", credibility: "高", sourceDate: "2026-03-01" }] }],
      onFocusCategory,
      onOpenResearch: () => undefined,
    }));

    expect(screen.getByText("关系与证据链")).toBeVisible();
    expect(screen.getByText("公司主营业务直接覆盖封装测试。")).toBeVisible();
    expect(screen.getByText("公司 → 下游 · 强度 86 · 2026-03-01")).toBeVisible();
    expect(screen.getByText("2025 年报")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /封测/ }));
    expect(onFocusCategory).toHaveBeenCalledWith(2);
  });
});
