// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseResearchSessionToRestore,
  inferExternalSecurityQuery,
  ReportPreview,
  ResearchIntelligenceDock,
} from "@/components/workbench/ResearchIntelligenceDock";
import type { ResearchConversationSession } from "@/lib/repositories/aiResearch";

const baseProps = {
  stockCode: "600030",
  companyName: "中信证券",
  categoryId: null,
  tab: "agents" as const,
  onTabChange: vi.fn(),
  onClose: vi.fn(),
  embedded: true,
  onTargetChange: vi.fn(),
};

describe("ResearchIntelligenceDock", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not auto-restore a stale legacy session over the latest research", () => {
    const session = (
      sessionId: string,
      stockCode: string,
      updatedAt: string,
    ): ResearchConversationSession => ({
      sessionId,
      title: sessionId,
      targetType: "company",
      subjectKey: stockCode,
      subjectLabel: stockCode,
      stockCode,
      categoryId: null,
      depth: "standard",
      skills: [],
      context: {},
      messageCount: 2,
      createdAt: updatedAt,
      updatedAt,
    });
    const newest = session("newest", "002156", "2026-07-31 11:14:14");
    const legacy = session("legacy", "603823", "2026-07-28 07:20:10");

    expect(chooseResearchSessionToRestore([newest, legacy], legacy.sessionId, legacy.stockCode))
      .toBe(newest);
  });

  it("never restores a quarantined legacy target-mismatch session", () => {
    const legacy: ResearchConversationSession = {
      sessionId: "legacy-market-company",
      title: "分析一下大盘走势",
      targetType: "company",
      subjectKey: "002979",
      subjectLabel: "雷赛智能",
      stockCode: "002979",
      categoryId: null,
      depth: "quick",
      skills: [],
      context: {},
      messageCount: 2,
      createdAt: "2026-08-12 09:00:00",
      updatedAt: "2026-08-12 09:00:00",
      integrityStatus: "legacy_target_mismatch",
    };
    const clean = { ...legacy, sessionId: "clean", title: "分析宁德时代", integrityStatus: "ok" as const };

    expect(chooseResearchSessionToRestore([legacy, clean], legacy.sessionId, legacy.stockCode)).toBe(clean);
  });

  it("renders free-form research markdown including tables, quotes, code and inline evidence links", () => {
    const { container } = render(createElement(ReportPreview, {
      markdown: [
        "# 动态研究结论",
        "> 这是主审保留的证据边界。",
        "| 指标 | 当前值 |",
        "| --- | ---: |",
        "| 毛利率 | **13.95%** |",
        "",
        "```text",
        "情景 A -> 核验订单",
        "```",
        "查看[公司公告](https://example.com/report)与 `source_id`。",
      ].join("\n"),
    }));

    expect(screen.getByRole("heading", { name: "动态研究结论" })).toBeVisible();
    expect(screen.getByRole("table")).toHaveTextContent("毛利率");
    expect(screen.getByText("13.95%", { selector: "strong" })).toBeVisible();
    expect(screen.getByRole("link", { name: "公司公告" })).toHaveAttribute("href", "https://example.com/report");
    expect(container.querySelector("blockquote")).toHaveTextContent("证据边界");
    expect(container.querySelector("pre code")).toHaveTextContent("情景 A -> 核验订单");
  });

  it("recognizes HK and US symbols without treating them as the current A-share company", () => {
    expect(inferExternalSecurityQuery("分析腾讯 hk00700")).toEqual({
      market: "HK",
      code: "00700",
      label: "腾讯 · HK 00700",
    });
    expect(inferExternalSecurityQuery("研究美股 NVDA")).toEqual({
      market: "US",
      code: "NVDA",
      label: "美股 · NVDA",
    });
  });

  it("keeps research depth in settings and shows honest evidence empty states", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ run: null, report: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));

    render(createElement(ResearchIntelligenceDock, baseProps));

    expect(await screen.findByRole("heading", { name: "AI研判" })).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "研究模式" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "研究设置" }));
    expect(screen.getByRole("button", { name: /^快速\s+单次综合/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /^标准\s+多角色研究/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /^深度\s+扩展检索/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("button", { name: "数据分析" })).not.toBeInTheDocument();
    expect(screen.getByText(/无需选择标的或套用格式/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "移除 bull_trend" })).not.toBeInTheDocument();
    expect(screen.getByText("运行后显示真实引用")).toBeVisible();
    expect(screen.getByText("当前目标尚无已完成研究")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "收起证据" }));
    expect(screen.getByRole("button", { name: "证据审计" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "证据审计" }));
    expect(screen.getByText("运行后显示真实引用")).toBeVisible();
    expect(screen.queryByText("关键指标趋势")).not.toBeInTheDocument();
    expect(screen.queryByText("AI 2024-2026 半导体周期展望")).not.toBeInTheDocument();
  });

  it("infers an industry directly from a natural-language financial question", async () => {
    const onTargetChange = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/stocks/lookup")) {
        return new Response(JSON.stringify({ error: "未匹配到 A 股股票" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/categories") {
        return new Response(JSON.stringify({
          categories: [{
            id: 12,
            name: "半导体",
            aliases: ["芯片"],
            industry: "电子",
            children: [],
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/ai/research/stream") {
        return new Response(`data: ${JSON.stringify({ type: "error", message: "测试结束" })}\n\n`, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return new Response(JSON.stringify({ run: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(createElement(ResearchIntelligenceDock, {
      ...baseProps,
      stockCode: null,
      companyName: "",
      onTargetChange,
    }));

    const questionInput = screen.getByRole("textbox", { name: "金融研判问题" });
    fireEvent.change(questionInput, { target: { value: "半导体行业当前景气度如何？" } });
    fireEvent.keyDown(questionInput, { key: "Enter" });

    await waitFor(() => expect(onTargetChange).toHaveBeenCalledWith(expect.objectContaining({
      targetType: "industry",
      subjectKey: "12",
      companyName: "半导体",
      categoryId: 12,
    })));
    expect(screen.queryByPlaceholderText("输入公司代码或名称")).not.toBeInTheDocument();
  });

  it("connects guide, settings and context without an idle progress scaffold", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ run: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    render(createElement(ResearchIntelligenceDock, baseProps));

    fireEvent.click(await screen.findByRole("button", { name: "说明" }));
    const guide = screen.getByRole("dialog", { name: "AI 研究使用指南" });
    expect(within(guide).getByText(/只保留带有效证据引用/)).toBeVisible();
    fireEvent.click(within(guide).getByRole("button", { name: "关闭" }));

    fireEvent.click(screen.getByRole("button", { name: "研究设置" }));
    const settings = screen.getByRole("dialog", { name: "研究设置" });
    const quickSetting = within(settings).getByRole("button", { name: /快速/ });
    fireEvent.click(quickSetting);
    expect(quickSetting).toHaveClass("is-active");
    fireEvent.click(within(settings).getByRole("button", { name: "关闭" }));

    fireEvent.click(screen.getByRole("button", { name: "添加上下文" }));
    const context = screen.getByRole("dialog", { name: "添加研究上下文" });
    fireEvent.change(within(context).getByPlaceholderText(/重点核验海外收入/), { target: { value: "只核验官方来源" } });
    fireEvent.click(within(context).getByRole("button", { name: "加入本次研究" }));
    expect((screen.getByRole("textbox", { name: "金融研判问题" }) as HTMLTextAreaElement).value).toContain("只核验官方来源");

    expect(screen.queryByText("问题理解")).not.toBeInTheDocument();
    expect(screen.queryByText(/深度研究进度/)).not.toBeInTheDocument();
  });

  it("accepts free-form input without requiring a stock or question template", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === "/api/ai/research/stream") {
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(`data: ${JSON.stringify({ type: "error", message: "测试结束" })}\n\n`, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return new Response(JSON.stringify({ run: null, sessions: [], categories: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(createElement(ResearchIntelligenceDock, baseProps));
    const question = await screen.findByRole("textbox", { name: "金融研判问题" });
    fireEvent.change(question, { target: { value: "你好" } });
    fireEvent.keyDown(question, { key: "Enter" });

    await waitFor(() => expect(requestBodies[0]).toMatchObject({
      targetType: "question",
      stockCode: "",
      question: "你好",
    }));
    expect(screen.queryByText(/这是研究引擎/)).not.toBeInTheDocument();
  });

  it("quarantines legacy sessions that started from a greeting", async () => {
    window.localStorage.clear();
    const legacyResult = {
      thesis: "不应继续展示的旧研究结论",
      investmentValue: "不应展示",
      confidence: "低",
      stages: [],
      catalysts: [],
      risks: [],
      verificationQuestions: [],
      evidenceBoundary: "旧会话",
      model: "test-model",
    };
    const legacySession = {
      sessionId: "legacy-greeting",
      title: "你好",
      targetType: "company",
      subjectKey: "603823",
      subjectLabel: "百合花",
      stockCode: "603823",
      categoryId: 9,
      depth: "standard",
      skills: ["bull_trend"],
      context: {},
      messageCount: 4,
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:01:00.000Z",
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/ai/research/sessions") {
        return new Response(JSON.stringify({ sessions: [legacySession] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/ai/research/sessions/legacy-greeting") {
        return new Response(JSON.stringify({
          session: legacySession,
          messages: [
            { id: 1, role: "user", content: "你好", metadata: {}, createdAt: legacySession.createdAt },
            { id: 2, role: "assistant", content: legacyResult.thesis, metadata: { result: legacyResult }, createdAt: legacySession.createdAt },
            { id: 3, role: "user", content: "长电科技", metadata: {}, createdAt: legacySession.updatedAt },
            { id: 4, role: "assistant", content: legacyResult.thesis, metadata: { result: legacyResult }, createdAt: legacySession.updatedAt },
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ run: null, report: null, skills: [], tools: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(createElement(ResearchIntelligenceDock, baseProps));

    await waitFor(() => expect(screen.getByText(/旧结论已自动隔离/)).toBeVisible());
    expect(screen.queryByText("不应继续展示的旧研究结论")).not.toBeInTheDocument();
    expect(screen.queryByText("长电科技")).not.toBeInTheDocument();
    expect(fetchSpy.mock.calls.some(([input]) => {
      const url = decodeURIComponent(String(input));
      return url.startsWith("/api/stocks/lookup") && url.includes("长电科技");
    })).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "新建会话" }));
    expect(await screen.findByRole("button", { name: "分析比亚迪趋势" })).toBeVisible();
    expect(screen.queryByText(/旧结论已自动隔离/)).not.toBeInTheDocument();
    expect(screen.getByText(/无需选择标的或套用格式/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "移除 bull_trend" })).not.toBeInTheDocument();
  });

  it("opens an isolated session when the chat input names another company", async () => {
    const onTargetChange = vi.fn();
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/stocks/lookup")) {
        return new Response(JSON.stringify({
          profile: {
            stockCode: "600584",
            shortName: "长电科技",
            board: "沪市主板",
            industry: "半导体封测",
            categoryId: null,
            categoryName: "",
          },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/ai/research/stream") {
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        const result = {
          thesis: "待补证据",
          investmentValue: "待核验",
          confidence: "低",
          stages: [],
          catalysts: [],
          risks: [],
          verificationQuestions: [],
          evidenceBoundary: "测试",
          model: "test-model",
        };
        return new Response(`data: ${JSON.stringify({
          type: "done",
          sessionId: "new-session-600584",
          run: {
            id: 1,
            stockCode: "600584",
            categoryId: null,
            question: "长电科技",
            depth: "standard",
            status: "completed",
            model: "test-model",
            result,
            error: "",
            createdAt: "2026-07-28T00:00:00.000Z",
            updatedAt: "2026-07-28T00:00:00.000Z",
          },
        })}\n\n`, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      if (url.includes("/api/ai/research/sessions/")) {
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ run: null, sessions: [], skills: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(createElement(ResearchIntelligenceDock, { ...baseProps, onTargetChange }));
    const question = await screen.findByRole("textbox", { name: "金融研判问题" });
    fireEvent.change(question, { target: { value: "长电科技" } });
    fireEvent.keyDown(question, { key: "Enter" });

    await waitFor(() => expect(onTargetChange).toHaveBeenCalledWith(expect.objectContaining({
      stockCode: "600584",
      companyName: "长电科技",
    })));
    await waitFor(() => expect(requestBodies[0]).toMatchObject({
      stockCode: "600584",
      subjectLabel: "长电科技",
      question: "长电科技",
    }));
    expect(screen.queryByPlaceholderText("输入公司代码或名称")).not.toBeInTheDocument();
  });

  it("detaches a market question from the current company before sending it", async () => {
    const onTargetChange = vi.fn();
    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/ai/research/stream") {
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(`data: ${JSON.stringify({ type: "error", message: "测试结束" })}\n\n`, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return new Response(JSON.stringify({ run: null, sessions: [], skills: [], tools: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(createElement(ResearchIntelligenceDock, { ...baseProps, onTargetChange }));
    const question = await screen.findByRole("textbox", { name: "金融研判问题" });
    fireEvent.change(question, { target: { value: "分析一下大盘走势" } });
    fireEvent.keyDown(question, { key: "Enter" });

    await waitFor(() => expect(requestBodies[0]).toMatchObject({
      targetType: "question",
      subjectKey: "market-cn",
      subjectLabel: "A股大盘",
      stockCode: "",
      question: "分析一下大盘走势",
      context: { marketResearch: { market: "cn", label: "A股大盘" } },
    }));
    expect(onTargetChange).toHaveBeenCalledWith(expect.objectContaining({
      targetType: "question",
      subjectKey: "market-cn",
      companyName: "A股大盘",
    }));
    expect(fetchSpy.mock.calls.some(([input]) => {
      const url = decodeURIComponent(String(input));
      return url.startsWith("/api/stocks/lookup") && url.includes("大盘走势");
    })).toBe(false);
    expect(screen.queryByPlaceholderText("输入公司代码或名称")).not.toBeInTheDocument();
  });

  it("selects multiple methods without launching and submits them with the user's own question", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const skills = [
      { id: "chan_theory", name: "缠论", description: "按分型、中枢与背驰分析", category: "framework", aliases: ["缠论"], requiredData: ["日线"], instructions: "严格识别中枢" },
      { id: "wave_theory", name: "波浪理论", description: "识别推动浪与调整浪", category: "framework", aliases: ["波浪"], requiredData: ["日线"], instructions: "提供备选计数" },
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/ai/research/skills") {
        return new Response(JSON.stringify({ skills }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.startsWith("/api/stocks/lookup")) {
        return new Response(JSON.stringify({ error: "沿用当前研究标的" }), { status: 404, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/ai/research/stream") {
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(`data: ${JSON.stringify({
          type: "done",
          sessionId: "method-session",
          run: {
            id: 7,
            stockCode: "600030",
            categoryId: null,
            question: "分析中信证券当前结构",
            depth: "standard",
            status: "completed",
            model: "test-model",
            result: {
              answerMarkdown: "中信证券当前结构需要结合盈利修复与资本开支验证，毛利率为 **13.95%**。 [evidence:1]",
              thesis: "封测景气修复，但估值与盈利兑现速度仍需交叉验证。",
              investmentValue: "这是一份由问题生成结构的研究备忘录，而不是固定章节摘要。",
              confidence: "中",
              answerBlocks: [{
                id: "earnings-path",
                title: "盈利修复路径与验证点",
                kind: "scenario",
                summary: "收入改善需要与毛利率和资本开支共同观察。",
                confidence: "中",
                narrative: [{ text: "当前证据支持需求边际改善，但尚不足以推出全年利润弹性。", citationIds: ["evidence:1"] }],
                keyMetrics: [{ label: "毛利率", value: "13.95%", context: "盈利质量仍偏薄。", direction: "negative", citationIds: ["evidence:1"] }],
                findings: ["需求出现边际改善"],
                findingClaims: [{ text: "需求出现边际改善", citationIds: ["evidence:1"] }],
                counterpoints: [{ text: "先进封装扩产也可能带来折旧压力。", citationIds: ["evidence:1"] }],
                implications: [{ text: "需要用后续两个季度的毛利率验证修复斜率。", citationIds: ["evidence:1"] }],
                citationIds: ["evidence:1"],
              }],
              stages: [],
              catalysts: ["先进封装需求改善"],
              risks: ["资本开支回报低于预期"],
              verificationQuestions: ["下一季度毛利率能否持续改善？"],
              evidenceBoundary: "仅基于可追溯的测试证据",
              model: "test-model",
              citations: [{ id: "evidence:1", title: "公司年度报告", sourceType: "公司公告", sourceDate: "2026-04-01", url: "https://example.com/report", excerpt: "毛利率为13.95%。", credibility: "高" }],
            },
            error: "",
            createdAt: "2026-08-03T00:00:00.000Z",
            updatedAt: "2026-08-03T00:00:00.000Z",
          },
        })}\n\n`, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      return new Response(JSON.stringify({ run: null, sessions: [], tools: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    render(createElement(ResearchIntelligenceDock, baseProps));

    await waitFor(() => expect(fetchSpy.mock.calls.some(([input]) => String(input) === "/api/ai/research/skills")).toBe(true));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(await screen.findByRole("button", { name: "策略与深度" }));
    const settingsDialog = await screen.findByRole("dialog", { name: "研究设置" });
    expect(settingsDialog).toBeVisible();
    const chan = within(settingsDialog).getByRole("button", { name: /^缠论/ });
    const wave = within(settingsDialog).getByRole("button", { name: /^波浪理论/ });
    fireEvent.click(chan);
    fireEvent.click(wave);
    expect(requestBodies).toHaveLength(0);
    expect(chan).toHaveClass("is-active");
    expect(wave).toHaveClass("is-active");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    const question = screen.getByRole("textbox", { name: "金融研判问题" });
    fireEvent.change(question, { target: { value: "分析中信证券当前结构" } });
    fireEvent.keyDown(question, { key: "Enter" });

    await waitFor(() => expect(requestBodies[0]).toMatchObject({
      question: "分析中信证券当前结构",
      skills: ["chan_theory", "wave_theory"],
    }));
    expect(await screen.findByText("AI 研判已完成")).toBeVisible();
    expect(screen.getByText(/中信证券当前结构需要结合盈利修复/)).toBeVisible();
    expect(screen.queryByText("DEEP RESEARCH MEMO")).not.toBeInTheDocument();
    expect(screen.queryByText("REPORT INDEX")).not.toBeInTheDocument();
    expect(screen.getAllByText("13.95%")[0]).toBeVisible();
    expect(screen.queryByText("反方证据 / 替代解释")).not.toBeInTheDocument();
    expect(screen.getByText("来源与证据账本")).toBeVisible();
    expect(screen.getByRole("link", { name: "打开来源 公司年度报告" })).toHaveAttribute("href", "https://example.com/report");
    expect(screen.getAllByText("缠论").some((node) => node.closest("button"))).toBe(true);
  });

  it("recovers a completed result from the saved session when the stream disconnects", async () => {
    let requestedSessionId = "";
    const result = {
      thesis: "后台研究已经完成并成功恢复。",
      investmentValue: "继续核验证据后再做判断。",
      confidence: "中",
      stages: [],
      catalysts: [],
      risks: ["估值波动"],
      verificationQuestions: [],
      evidenceBoundary: "测试证据边界",
      model: "test-model",
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/stocks/lookup")) {
        return new Response(JSON.stringify({ error: "没有新的标的" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/ai/research/stream") {
        requestedSessionId = String((JSON.parse(String(init?.body)) as { sessionId: string }).sessionId);
        return new Response("", {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      if (requestedSessionId && url === `/api/ai/research/sessions/${requestedSessionId}`) {
        return new Response(JSON.stringify({
          session: {
            sessionId: requestedSessionId,
            title: "中信证券核心风险",
            targetType: "company",
            subjectKey: "600030",
            subjectLabel: "中信证券",
            stockCode: "600030",
            categoryId: null,
            depth: "standard",
            skills: ["bull_trend"],
            context: {},
            messageCount: 2,
            createdAt: "2026-07-28T00:00:00.000Z",
            updatedAt: "2026-07-28T00:01:00.000Z",
          },
          messages: [{
            id: 1,
            role: "assistant",
            content: result.thesis,
            metadata: { result },
            createdAt: "2026-07-28T00:01:00.000Z",
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ run: null, sessions: [], skills: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(createElement(ResearchIntelligenceDock, baseProps));
    const question = await screen.findByRole("textbox", { name: "金融研判问题" });
    fireEvent.change(question, { target: { value: "中信证券核心风险" } });
    fireEvent.keyDown(question, { key: "Enter" });

    expect(await screen.findByText("后台研究已经完成并成功恢复。")).toBeVisible();
    expect(screen.queryByText("AI 研究流连接失败")).not.toBeInTheDocument();
  });

  it("requests server-side cancellation when the user stops a running study", async () => {
    let cancelUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/stocks/lookup")) {
        return new Response(JSON.stringify({ error: "没有新的标的" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/ai/research/stream") {
        const signal = init?.signal;
        return new Response(new ReadableStream({
          start(controller) {
            signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
          },
        }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      if (url.endsWith("/cancel")) {
        cancelUrl = url;
        return new Response(JSON.stringify({ cancelled: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ run: null, sessions: [], skills: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(createElement(ResearchIntelligenceDock, baseProps));
    const question = await screen.findByRole("textbox", { name: "金融研判问题" });
    fireEvent.change(question, { target: { value: "分析中信证券的主要风险" } });
    fireEvent.keyDown(question, { key: "Enter" });

    const stop = await screen.findByRole("button", { name: "停止研究" });
    fireEvent.click(stop);

    await waitFor(() => expect(cancelUrl).toMatch(/^\/api\/ai\/research\/sessions\/.+\/cancel$/));
    expect(await screen.findByText("本次研究已停止，可修改问题后重新发起")).toBeVisible();
  });
});
