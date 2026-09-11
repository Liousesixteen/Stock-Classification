// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AtlasCompanySnapshot } from "@/components/atlas/AtlasCompanySnapshot";
import { getCompanyChainProfile } from "@/lib/industry-graph/companyChainProfiles";

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
        businessLines: [{ name: "集成电路封装测试", share: "86%", grossMargin: "18%" }],
        chainPosition: ["封装测试"],
        keyCustomers: ["AMD"],
        sourceSummary: "2025 年报",
        quality: { overallScore: 88, fieldCoverageScore: 90, evidenceCoverageScore: 82, reliabilityLabel: "可靠" },
      },
      peerCompanies: ["长电科技", "华天科技"],
      onOpenResearch: () => undefined,
      onOpenReport: () => undefined,
    }));
    expect(screen.getByRole("heading", { name: "通富微电" })).toBeVisible();
    expect(screen.getByText("国内领先的封装测试企业。")).toBeVisible();
    expect(screen.getByText("12")).toBeVisible();
    expect(screen.getByText("集成电路封装测试")).toBeVisible();
    expect(screen.getByText("先进封装技术积累")).toBeVisible();
    expect(screen.getAllByText("AMD").length).toBeGreaterThan(0);
    expect(screen.getByText("长电科技")).toBeVisible();
  });

  it("keeps AI stock inquiry enabled while details load", () => {
    render(createElement(AtlasCompanySnapshot, { stockCode: "002156", state: { status: "loading", name: "通富微电" }, onOpenResearch: () => undefined, onOpenReport: () => undefined }));
    expect(screen.getByLabelText("资料补全中")).toBeVisible();
    expect(screen.getByRole("button", { name: "AI研判" })).toBeEnabled();
  });

  it("renders the grouped Shengyi chain without turning business facts into stars", () => {
    render(createElement(AtlasCompanySnapshot, {
      stockCode: "600183",
      chainProfile: getCompanyChainProfile("600183"),
      state: {
        status: "ready",
        company: { stockCode: "600183", shortName: "生益科技", fullName: "", board: "沪市主板", industry: "电子材料", region: "广东", marketCapBand: "", intro: "", mainBusiness: "", updatedAt: "" },
        relations: [], evidenceCount: 0, summary: "", advantages: [],
        quality: { overallScore: 70, fieldCoverageScore: 80, evidenceCoverageScore: 30, reliabilityLabel: "待核验" },
      },
      onOpenResearch: () => undefined,
      onOpenReport: () => undefined,
    }));
    expect(screen.getByText("原有产业分类主干")).toBeVisible();
    expect(screen.getByText("表格补充产业链关系")).toBeVisible();
    expect(screen.getByRole("button", { name: /上游核心原材料/ })).toBeVisible();
    expect(screen.getByText("覆铜板 CCL + PP")).toBeVisible();
    expect(screen.getAllByText(/沪电股份/).length).toBeGreaterThan(0);
    expect(screen.queryByText("分部间抵销")).not.toBeInTheDocument();
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
      onOpenReport: () => undefined,
    }));

    expect(screen.getByText("关系与证据链")).toBeVisible();
    expect(screen.getByText("公司主营业务直接覆盖封装测试。")).toBeVisible();
    expect(screen.getByText("公司 → 下游 · 强度 86 · 2026-03-01")).toBeVisible();
    expect(screen.getByText("2025 年报")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /封测/ }));
    expect(onFocusCategory).toHaveBeenCalledWith(2);
  });
});
