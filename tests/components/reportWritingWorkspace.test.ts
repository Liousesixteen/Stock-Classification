// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportWritingWorkspace } from "@/components/workbench/ReportWritingWorkspace";

const target = {
  targetType: "company" as const,
  subjectKey: "002156",
  stockCode: "002156",
  companyName: "通富微电",
  board: "深市主板",
  industry: "半导体",
  categoryId: 10,
};

const baseProps = {
  target,
  report: null,
  versions: [],
  researchResult: null,
  writing: false,
  saving: false,
  rewriting: false,
  reportType: "company" as const,
  focus: "主营业务、产业链位置与核心风险",
  comparisonCodes: "",
  error: "",
  onReportTypeChange: vi.fn(),
  onFocusChange: vi.fn(),
  onComparisonCodesChange: vi.fn(),
  onGenerate: vi.fn(),
  onSave: vi.fn(),
  onRewrite: vi.fn(),
  onRestore: vi.fn(),
  onExport: vi.fn(),
  onBackToResearch: vi.fn(),
};

describe("ReportWritingWorkspace", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a structured nine-section workspace before the first report is generated", () => {
    render(createElement(ReportWritingWorkspace, baseProps));

    expect(screen.getByRole("heading", { name: "报告大纲" })).toBeVisible();
    expect(screen.getByRole("button", { name: /01 投资摘要/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /09 结论与待验证事项/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /公司深度/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /赛道研究/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /公司对比/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /事件点评/ })).toBeVisible();
    expect(screen.getByText("通富微电研究报告尚未生成")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "开始生成研报" }));
    expect(baseProps.onGenerate).toHaveBeenCalledTimes(1);
  });

  it("renders generated content and enables markdown export", () => {
    render(createElement(ReportWritingWorkspace, {
      ...baseProps,
      report: {
        id: 1,
        subjectKey: "002156",
        subjectLabel: "通富微电",
        stockCode: "002156",
        categoryId: 10,
        reportType: "company",
        comparisonCodes: [],
        title: "通富微电深度研究报告",
        executiveSummary: "封测业务研究摘要",
        markdown: "# 通富微电深度研究报告\n\n## 投资摘要\n\n集成电路封装测试",
        model: "test-model",
        status: "ready",
        currentVersion: 1,
        citations: [],
        quality: {
          score: 80,
          sectionCoverage: 80,
          citationCoverage: 70,
          evidenceQuality: 75,
          riskDisclosure: 80,
          unsupportedClaimCount: 0,
          issues: [],
        },
        charts: [],
        createdAt: "2026-07-15T10:00:00.000Z",
        updatedAt: "2026-07-15T10:00:00.000Z",
      },
    }));

    expect(screen.getByDisplayValue("集成电路封装测试")).toBeVisible();
    const exportButton = screen.getByRole("button", { name: /Markdown/ });
    expect(exportButton).toBeEnabled();
    fireEvent.click(exportButton);
    expect(baseProps.onExport).toHaveBeenCalledWith("markdown");
    expect(screen.getByRole("button", { name: /Word/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /PDF/ })).toBeEnabled();

    const editor = screen.getByRole("textbox", { name: "投资摘要章节正文" });
    fireEvent.change(editor, { target: { value: "更新后的投资摘要 [evidence:1]" } });
    fireEvent.click(screen.getByRole("button", { name: /保存版本/ }));
    expect(baseProps.onSave).toHaveBeenCalledWith(expect.stringContaining("更新后的投资摘要"));

    fireEvent.click(screen.getByRole("button", { name: /AI 改写本节/ }));
    expect(baseProps.onRewrite).toHaveBeenCalledWith("投资摘要", expect.any(String));
  });
});
