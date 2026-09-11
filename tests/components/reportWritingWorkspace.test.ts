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
  reportEngine: "native" as const,
  finSightAvailability: { available: true, missing: [] },
  focus: "主营业务、产业链位置与核心风险",
  comparisonCodes: "",
  error: "",
  onReportTypeChange: vi.fn(),
  onReportEngineChange: vi.fn(),
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

  it("shows report history and a structured generation blueprint before the first report", () => {
    render(createElement(ReportWritingWorkspace, baseProps));

    expect(screen.getByRole("heading", { name: "历史研报" })).toBeVisible();
    expect(screen.getByText("还没有历史研报")).toBeVisible();
    expect(screen.queryByText("研报任务")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "你想研究什么？" })).toBeVisible();
    expect(screen.getByText("自动识别")).toBeVisible();
    expect(screen.queryByText("通富微电公司深度报告")).not.toBeInTheDocument();
    expect(screen.getByText("报告将覆盖")).toBeVisible();
    expect(screen.getAllByText("01 投资摘要").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /公司深度/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /行业研究/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /公司对比/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /事件影响/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /宏观研究/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /开放研究/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /星图多智能体/ })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "问题已转化为可执行的研究路径" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "生成研报" }));
    expect(baseProps.onGenerate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /星图多智能体/ }));
    expect(baseProps.onReportEngineChange).toHaveBeenCalledWith("finsight");
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
        engine: "native",
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
        artifacts: [],
        createdAt: "2026-07-15T10:00:00.000Z",
        updatedAt: "2026-07-15T10:00:00.000Z",
      },
    }));

    expect(screen.getByDisplayValue("集成电路封装测试")).toBeVisible();
    const exportButton = screen.getByRole("button", { name: "导出 Markdown 报告" });
    expect(exportButton).toBeEnabled();
    fireEvent.click(exportButton);
    expect(baseProps.onExport).toHaveBeenCalledWith("markdown");
    expect(screen.getByRole("button", { name: "导出 Word 报告" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "导出 PDF 报告" })).toBeEnabled();

    const editor = screen.getByRole("textbox", { name: "投资摘要章节正文" });
    fireEvent.change(editor, { target: { value: "更新后的投资摘要 [evidence:1]" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(baseProps.onSave).toHaveBeenCalledWith(expect.stringContaining("更新后的投资摘要"));

    fireEvent.click(screen.getByRole("button", { name: /AI 改写本节/ }));
    expect(baseProps.onRewrite).toHaveBeenCalledWith("投资摘要", expect.any(String));
  });

  it("shows live multi-agent pipeline progress while a report is being generated", () => {
    render(createElement(ReportWritingWorkspace, {
      ...baseProps,
      writing: true,
      generationProgress: [{
        phase: "drafting",
        step: 5,
        totalSteps: 7,
        message: "正在生成完整研报正文",
        detail: "模型正在按统一大纲组织章节",
        reportType: "company",
        completedSections: 0,
        totalSections: 9,
        createdAt: "2026-08-22T00:00:00.000Z",
      }],
    }));

    expect(screen.getByRole("heading", { name: "正在生成完整研报正文" })).toBeVisible();
    expect(screen.getByText("STAR ATLAS PIPELINE / 深度研报流水线")).toBeVisible();
    expect(screen.getAllByText("投资摘要").length).toBeGreaterThan(0);
  });
});
