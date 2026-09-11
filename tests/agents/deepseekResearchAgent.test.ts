import { describe, expect, it } from "vitest";
import { applyResearchResultGuardrails, buildEvidenceFallbackResearchResult, generateResearchReport, runDeepResearchTeam, type CompanyResearchFacts, type DeepResearchResult } from "@/lib/agents/deepseekResearchAgent";

const facts: CompanyResearchFacts = {
  subject: { kind: "company", label: "示例公司", key: "000001" },
  company: { stockCode: "000001", shortName: "示例公司", industry: "电子" },
  relations: [{ categoryName: "机器人", relationType: "重要相关", confidence: "中" }],
  evidence: [{
    id: 1,
    title: "示例公告",
    sourceType: "公告",
    excerpt: "公司产品用于机器人相关环节",
    credibility: "高",
    url: "https://example.com/notice",
    verificationStatus: "unverified",
    isExpired: false,
  }],
  researchProfile: null,
  fieldFacts: [],
  dossierQuality: { overallScore: 40, reliabilityLabel: "待核验" },
  evidenceTimeline: [],
  graphRelations: [],
  notes: [],
};

function response(content: object) {
  return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { total_tokens: 120 } }), { status: 200 }));
}

function rawResponse(content: string, finishReason = "length") {
  return Promise.resolve(new Response(JSON.stringify({
    choices: [{ finish_reason: finishReason, message: { content } }],
    usage: { total_tokens: 120 },
  }), { status: 200 }));
}

function researchPlanResponse() {
  return response({
    objective: "围绕用户问题形成动态研究结论",
    targetLabel: "示例公司",
    rationale: "按业务、产业、情报与反证拆分并行任务",
    tasks: [
      { id: "business", name: "基本面 Agent", mission: "核验业务与经营质量", reason: "建立事实底座", kind: "domain", evidenceKeywords: ["业务", "财务"], expectedOutput: "业务判断" },
      { id: "industry", name: "产业链 Agent", mission: "核验产业链位置", reason: "回答产业位置", kind: "domain", evidenceKeywords: ["产业", "行业"], expectedOutput: "产业判断" },
      { id: "intel", name: "情报 Agent", mission: "核验公告与催化", reason: "识别变化", kind: "verification", evidenceKeywords: ["公告", "订单"], expectedOutput: "催化判断" },
      { id: "risk", name: "风险 Agent", mission: "寻找反证与失效条件", reason: "校准置信度", kind: "counter", evidenceKeywords: ["风险"], expectedOutput: "反证" },
    ],
    answerLayout: [
      { id: "core", title: "核心问题研判", kind: "analysis", question: "核心结论是什么" },
      { id: "counter", title: "反证与失效条件", kind: "risk", question: "什么会推翻结论" },
    ],
    synthesisCriteria: ["事实必须有引用", "展示分歧"],
  });
}

describe("deepseek research agent", () => {
  it("aligns broad-market wording with index signs and exposes missing sector data", () => {
    const citationId = "field:marketIndices:腾讯财经主要指数";
    const result: DeepResearchResult = {
      thesis: "主要指数涨跌互现，市场主线明显。",
      investmentValue: "主要指数涨跌分化，投资者应轻仓观望并控制仓位。",
      confidence: "中",
      stages: [{ id: "quick", name: "协调 Agent", mission: "研判", summary: "主要指数涨跌互现。", findings: ["主要指数涨跌分化。"], confidence: "中", evidenceGaps: [], citationIds: [citationId] }],
      catalysts: [],
      risks: [],
      verificationQuestions: [],
      evidenceBoundary: "仅基于当前数据。",
      answerBlocks: [{
        id: "market-breadth",
        title: "市场广度、风格与板块轮动",
        kind: "analysis",
        summary: "多数板块上涨。",
        findings: ["科技板块领涨。"],
        keyMetrics: [{ label: "主要指数合计成交额", value: "2.7万亿元", context: "重叠指数直接相加", direction: "neutral", citationIds: [citationId] }],
        citationIds: [citationId],
      }],
      model: "test",
      citations: [],
    };
    const marketFacts: CompanyResearchFacts = {
      ...facts,
      subject: { kind: "question", key: "market-cn", label: "A股大盘" },
      company: { subjectType: "market" },
      fieldFacts: [{
        fieldKey: "marketIndices",
        value: [{ name: "上证指数", changePercent: 0.3 }, { name: "深证成指", changePercent: 1.1 }],
        status: "available",
      }],
    };

    const guarded = applyResearchResultGuardrails(result, marketFacts);
    expect(guarded.thesis).toContain("主要指数全线上涨");
    expect(guarded.investmentValue).toContain("不提供仓位或交易指令");
    expect(guarded.answerBlocks?.[0]?.summary).toContain("行业涨跌排名本轮未成功返回");
    expect(JSON.stringify(guarded.answerBlocks?.[0])).not.toContain("科技板块领涨");
    expect(JSON.stringify(guarded.answerBlocks)).not.toContain("2.7万亿元");
  });

  it("keeps a broad-market fallback focused on indices and rotation", () => {
    const result = buildEvidenceFallbackResearchResult({
      ...facts,
      subject: { kind: "question", key: "market-cn", label: "A股大盘" },
      company: { subjectType: "market", market: "cn", label: "A股大盘" },
      evidence: [],
      fieldFacts: [{
        fieldKey: "marketIndices",
        value: [{ name: "上证指数", changePercent: -0.2 }],
        status: "available",
        provider: "腾讯财经主要指数",
        sourceUrl: "https://qt.gtimg.cn/q=sh000001",
        confidence: "high",
        verificationStatus: "unverified",
        fetchedAt: "2026-08-12T00:00:00.000Z",
      }],
    }, { depth: "standard", question: "分析一下大盘走势", reason: "terminated" });

    expect(result.thesis).toContain("A股大盘");
    expect(result.thesis).toContain("指数、板块轮动与市场情报");
    expect(result.verificationQuestions.join(" ")).not.toContain("主营增长质量");
    expect(JSON.stringify(result)).not.toContain("雷赛智能");
  });

  it("corrects false missing-history claims when index technical data is present", () => {
    const citationId = "field:marketTechnicalSnapshots:腾讯财经指数历史日线";
    const result: DeepResearchResult = {
      answerMarkdown: "沪深300指数报4540点附近（数据截断，具体点位待核）。由于缺乏更长时间序列的均线数据，无法精确计算MA5。当前放量下跌。",
      thesis: "当前放量下跌。",
      investmentValue: "由于缺乏更长时间序列的均线数据，无法精确计算均线。",
      confidence: "中",
      stages: [], catalysts: [], risks: [], verificationQuestions: [], evidenceBoundary: "", model: "test", citations: [],
    };
    const marketFacts: CompanyResearchFacts = {
      ...facts,
      company: { subjectType: "market" },
      fieldFacts: [
        { fieldKey: "marketIndices", status: "available", value: [{ code: "000300", price: 4547.96, changePercent: -1.38 }] },
        { fieldKey: "marketTechnicalSnapshots", status: "available", value: { snapshots: [{ stockCode: "000001", recordCount: 160, volumeRatio5: 0.96, ma: { ma5: 3963.27, ma10: 3930.92, ma20: 3935.92, ma60: 3956.37 } }] }, provider: "腾讯财经指数历史日线" },
      ],
    };

    const guarded = applyResearchResultGuardrails(result, marketFacts);
    expect(guarded.answerMarkdown).toContain("沪深300指数报4547.96点");
    expect(guarded.answerMarkdown).toContain("历史日线已覆盖160个交易日");
    expect(guarded.answerMarkdown).toContain("量比未显著放大");
    expect(guarded.answerMarkdown).not.toContain("数据截断");
  });

  it("turns provider billing failures into an actionable message", async () => {
    await expect(runDeepResearchTeam(
      facts,
      { question: "快速分析", depth: "quick" },
      { apiKey: "test", model: "test-model" },
      async () => new Response("", { status: 402 }),
    )).rejects.toThrow("账户余额或可用额度不足");
  });

  it("does not display model-memory prose when no claim has a valid citation", async () => {
    const emptyFacts = { ...facts, evidence: [], fieldFacts: [] };
    const result = await runDeepResearchTeam(
      emptyFacts,
      { question: "分析某公司的基本面和风险", depth: "quick" },
      { apiKey: "test", model: "test-model" },
      () => response({
        answerMarkdown: "该公司是全球龙头，长期受益于国产替代。",
        thesis: "基本面稳健",
        investmentValue: "值得买入",
        confidence: "高",
        citationIds: [], stages: [], catalysts: [], risks: [], verificationQuestions: [], evidenceBoundary: "",
      }),
    );
    expect(result.answerMarkdown).toContain("没有足够的可追溯资料");
    expect(result.answerMarkdown).not.toContain("全球龙头");
    expect(result.confidence).toBe("低");
  });

  it("normalizes a five-role research result and keeps the configured model", async () => {
    const calls: string[] = [];
    const progress: string[] = [];
    const result = await runDeepResearchTeam(facts, {
      question: "研究价值",
      depth: "standard",
      onProgress: (event) => progress.push(`${event.type}:${event.displayName ?? event.message}`),
    }, { apiKey: "test", model: "test-model" }, async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const payload = JSON.parse(request.messages[1]!.content) as { task: string; role?: { id?: string } };
      calls.push(payload.task);
      if (payload.task === "研究规划") return researchPlanResponse();
      if (payload.task === "独立专家研判") {
        return response({
          id: payload.role?.id,
          summary: payload.role?.id === "industry" ? "位于零部件环节" : "已完成独立核验",
          findings: [{ statement: "存在业务关联", citationIds: ["evidence:1"] }],
          citationIds: ["evidence:1"],
          confidence: "高",
          evidenceGaps: [],
        });
      }
      return response({
        thesis: "具备调研价值",
        investmentValue: "建议继续核验",
        confidence: "高",
        citationIds: ["evidence:1"],
        chief: {
          summary: "主审确认当前结论有一条公告支持",
          findings: [{ statement: "主审保留结论", citationIds: ["evidence:1"] }],
          citationIds: ["evidence:1"],
          confidence: "高",
          evidenceGaps: [],
        },
        catalysts: [{ statement: "订单验证", citationIds: ["evidence:1"] }],
        risks: [{ statement: "需求波动", citationIds: ["evidence:1"] }],
        verificationQuestions: ["收入占比是多少？"],
      });
    });
    expect(result.stages).toHaveLength(5);
    expect(result.stages[1]?.summary).toBe("位于零部件环节");
    expect(result.model).toBe("test-model");
    expect(result.citations).toEqual([expect.objectContaining({ id: "evidence:1", title: "示例公告" })]);
    expect(result.execution).toMatchObject({ mode: "standard", agentCalls: 6, totalTokens: 720 });
    expect(calls.filter((task) => task === "独立专家研判")).toHaveLength(4);
    expect(calls[0]).toBe("研究规划");
    expect(calls.at(-1)).toBe("主审交叉验证");
    expect(progress).toContain("agent_start:基本面 Agent");
    expect(progress).toContain("agent_done:主审 Agent");
    expect(progress.at(-1)).toContain("generating:");
  });

  it("drops unsupported claims and uses one call in quick mode", async () => {
    let calls = 0;
    let requestBody: Record<string, unknown> = {};
    const result = await runDeepResearchTeam(facts, { question: "开放问题", depth: "quick" }, { apiKey: "test", model: "test-model" }, (_input, init) => {
      calls += 1;
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const request = requestBody as { messages: Array<{ content: string }> };
      const payload = JSON.parse(request.messages[1]!.content) as { roles?: Array<{ id?: string }> };
      const stageId = payload.roles?.[0]?.id ?? "counter-evidence";
      return response({
        thesis: "没有合法引用的结论",
        confidence: "高",
        citationIds: ["made-up:99"],
        stages: [{ id: stageId, summary: "无依据", findings: ["模型自由发挥"], confidence: "高", evidenceGaps: [] }],
        catalysts: ["无引用催化"],
        risks: [{ statement: "引用不存在", citationIds: ["made-up:99"] }],
        verificationQuestions: ["需要什么证据？"],
      });
    });
    expect(calls).toBe(1);
    expect(requestBody.thinking).toEqual({ type: "disabled" });
    expect(result.confidence).toBe("低");
    expect(result.thesis).toContain("没有足够");
    expect(result.citations).toEqual([]);
    expect(result.catalysts).toEqual(["催化因素待验证"]);
    expect(result.stages[0]?.findings).toEqual([]);
    expect(result.unsupportedClaimCount).toBeGreaterThan(0);
  });

  it("uses short source aliases in the model prompt and restores canonical citation ids", async () => {
    let promptEvidenceId = "";
    const result = await runDeepResearchTeam(
      facts,
      { question: "分析示例公司", depth: "quick", skills: [] },
      { apiKey: "test", model: "test-model" },
      async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const payload = JSON.parse(request.messages[1]!.content) as {
          evidenceCatalog: Array<{ id: string }>;
          roles?: Array<{ id?: string }>;
        };
        promptEvidenceId = payload.evidenceCatalog[0]?.id ?? "";
        const stageId = payload.roles?.[0]?.id ?? "counter-evidence";
        return response({
          answerMarkdown: "这家公司目前只有一项公告能证明产品进入相关环节，尚不足以回答收入贡献。 [SRC1]",
          thesis: "公司存在可核验业务关系",
          investmentValue: "继续核验",
          confidence: "中",
          citationIds: ["SRC1"],
          stages: [{
            id: stageId,
            summary: "公告支持业务关系",
            findings: [{ statement: "产品用于相关环节", citationIds: ["SRC1"] }],
            citationIds: ["SRC1"],
            confidence: "中",
            evidenceGaps: [],
          }],
          answerBlocks: [{
            id: "business",
            title: "公司与核心业务",
            kind: "analysis",
            summary: "公告支持业务关系",
            confidence: "中",
            narrative: [
              { text: "公告披露的产品应用构成当前业务判断的主要依据。", citationIds: ["SRC1"] },
              { text: "这段没有证据，应被拦截。", citationIds: ["UNKNOWN"] },
            ],
            keyMetrics: [{
              label: "证据覆盖",
              value: "1项",
              context: "目前仅有一项公告证据可支撑该判断。",
              direction: "neutral",
              citationIds: ["SRC1"],
            }],
            findings: [
              { statement: "公司产品用于机器人相关环节", citationIds: ["SRC1"] },
              { statement: "无引用内容不得进入正文", citationIds: ["UNKNOWN"] },
            ],
            counterpoints: [{ statement: "公告尚未披露该业务收入占比。", citationIds: ["SRC1"] }],
            implications: [{ statement: "结论应保持观察级而非投资级。", citationIds: ["SRC1"] }],
            citationIds: ["SRC1"],
          }],
          decisionDashboard: {
            signal: "关注",
            timeSensitivity: "等待业务占比核验",
            noPosition: "核验前保持观察",
            hasPosition: "跟踪公告并控制风险",
            watchConditions: ["业务收入占比得到公告确认"],
            citationIds: ["SRC1"],
          },
          catalysts: [],
          risks: [],
          verificationQuestions: ["收入占比是多少？"],
        });
      },
    );

    expect(promptEvidenceId).toBe("SRC1");
    expect(result.answerMarkdown).toContain("[evidence:1]");
    expect(result.answerMarkdown).not.toContain("[SRC1]");
    expect(result.citations).toEqual([expect.objectContaining({ id: "evidence:1" })]);
    expect(result.stages[0]?.citationIds).toEqual(["evidence:1"]);
    expect(result.answerBlocks).toEqual([expect.objectContaining({
      id: "business",
      findings: ["公司产品用于机器人相关环节"],
      citationIds: ["evidence:1"],
      narrative: [{ text: "公告披露的产品应用构成当前业务判断的主要依据。", citationIds: ["evidence:1"] }],
      keyMetrics: [expect.objectContaining({ label: "证据覆盖", value: "1项", citationIds: ["evidence:1"] })],
      counterpoints: [{ text: "公告尚未披露该业务收入占比。", citationIds: ["evidence:1"] }],
      implications: [{ text: "结论应保持观察级而非投资级。", citationIds: ["evidence:1"] }],
    })]);
    expect(result.decisionDashboard).toMatchObject({ signal: "关注", citationIds: ["evidence:1"] });
    expect(result.unsupportedClaimCount).toBeGreaterThanOrEqual(3);
  });

  it("sends bounded context instead of duplicating the full raw dossier for every agent", async () => {
    const largeFacts: CompanyResearchFacts = {
      ...facts,
      company: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`field${index}`, "公司原始资料".repeat(300)])),
      fieldFacts: Array.from({ length: 80 }, (_, index) => ({
        fieldKey: `metric${index}`,
        value: { detail: `字段证据${index}`.repeat(400) },
        status: "available",
        provider: "Test Provider",
        sourceUrl: `https://example.com/fact/${index}`,
        confidence: "high",
        verificationStatus: "unverified",
        fetchedAt: "2026-07-29T00:00:00.000Z",
      })),
    };
    let modelPayload: Record<string, unknown> = {};

    await runDeepResearchTeam(
      largeFacts,
      { question: "快速分析", depth: "quick" },
      { apiKey: "test", model: "test-model" },
      async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        modelPayload = JSON.parse(request.messages[1]!.content) as Record<string, unknown>;
        return response({
          thesis: "有界输入测试",
          investmentValue: "继续核验",
          confidence: "中",
          citationIds: ["evidence:1"],
          stages: [],
          catalysts: [],
          risks: [],
          verificationQuestions: ["下一步"],
        });
      },
    );

    expect(modelPayload).not.toHaveProperty("facts");
    expect(modelPayload).toHaveProperty("researchContext");
    expect(modelPayload.evidenceCatalog).toHaveLength(24);
    expect(JSON.stringify(modelPayload).length).toBeLessThan(32_000);
  });

  it("runs selected strategies as bounded specialist agents with conversation context", async () => {
    const roles: string[] = [];
    const histories: unknown[] = [];
    const result = await runDeepResearchTeam(facts, {
      question: "继续判断结构",
      depth: "standard",
      skills: ["chan_theory", "wave_theory", "unknown"],
      conversationHistory: [{ role: "user", content: "先判断趋势" }, { role: "assistant", content: "需要日线证据" }],
    }, { apiKey: "test", model: "test-model" }, async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const payload = JSON.parse(request.messages[1]!.content) as {
        task: string;
        role?: { id?: string };
        conversationHistory?: unknown[];
      };
      if (payload.task === "研究规划") return researchPlanResponse();
      if (payload.task === "独立专家研判") {
        roles.push(payload.role?.id ?? "");
        histories.push(payload.conversationHistory);
        return response({
          id: payload.role?.id,
          summary: "数据不足",
          findings: [],
          citationIds: [],
          confidence: "低",
          evidenceGaps: ["需要日线数据"],
        });
      }
      return response({
        thesis: "当前只能形成待核验结论",
        investmentValue: "先补数据",
        confidence: "中",
        citationIds: ["evidence:1"],
        chief: { summary: "主审结论", findings: [], citationIds: ["evidence:1"], confidence: "中", evidenceGaps: [] },
        catalysts: [],
        risks: [],
        verificationQuestions: ["补充技术数据"],
      });
    });

    expect(roles).toContain("skill:chan_theory");
    expect(roles).toContain("skill:wave_theory");
    expect(roles).not.toContain("skill:unknown");
    expect(histories[0]).toHaveLength(2);
    expect(result.stages.map((stage) => stage.id)).toContain("skill:chan_theory");
    expect(result.execution).toMatchObject({
      agentCalls: 7,
      maxAgentCalls: 7,
      skills: ["chan_theory", "wave_theory"],
    });
  });

  it("retries an incomplete JSON response and completes the research", async () => {
    let businessAttempts = 0;
    let repairPrompt = "";
    const result = await runDeepResearchTeam(
      facts,
      { question: "研究价值", depth: "standard" },
      { apiKey: "test", model: "test-model" },
      async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const payload = JSON.parse(request.messages[1]!.content) as { task: string; role?: { id?: string } };
        if (payload.task === "研究规划") return researchPlanResponse();
        if (payload.task === "独立专家研判" && payload.role?.id === "business") {
          businessAttempts += 1;
          if (businessAttempts === 1) return rawResponse("{\"summary\":\"输出被截断");
          repairPrompt = request.messages.at(-1)?.content ?? "";
        }
        if (payload.task === "独立专家研判") {
          return response({
            id: payload.role?.id,
            summary: "专家已完成",
            findings: [{ statement: "存在业务关联", citationIds: ["evidence:1"] }],
            citationIds: ["evidence:1"],
            confidence: "中",
            evidenceGaps: [],
          });
        }
        return response({
          thesis: "具备进一步核验价值",
          investmentValue: "继续跟踪",
          confidence: "中",
          citationIds: ["evidence:1"],
          chief: {
            summary: "主审完成",
            findings: [],
            citationIds: ["evidence:1"],
            confidence: "中",
            evidenceGaps: [],
          },
          catalysts: [],
          risks: [],
          verificationQuestions: ["继续核验证据"],
        });
      },
    );

    expect(businessAttempts).toBe(2);
    expect(repairPrompt).toContain("输出被截断");
    expect(repairPrompt).not.toContain("researchContext");
    expect(result.thesis).toBe("具备进一步核验价值");
    expect(result.execution?.totalTokens).toBe(840);
  });

  it("isolates a repeatedly malformed specialist and still finishes with the other roles", async () => {
    const progress: Array<{ type: string; displayName?: string; success?: boolean }> = [];
    const result = await runDeepResearchTeam(
      facts,
      {
        question: "研究价值",
        depth: "standard",
        onProgress: (event) => progress.push(event),
      },
      { apiKey: "test", model: "test-model" },
      async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const payload = JSON.parse(request.messages[1]!.content) as { task: string; role?: { id?: string } };
        if (payload.task === "研究规划") return researchPlanResponse();
        if (payload.task === "独立专家研判" && payload.role?.id === "risk") {
          return rawResponse("{\"summary\":\"仍然被截断");
        }
        if (payload.task === "独立专家研判") {
          return response({
            id: payload.role?.id,
            summary: "专家已完成",
            findings: [{ statement: "存在业务关联", citationIds: ["evidence:1"] }],
            citationIds: ["evidence:1"],
            confidence: "中",
            evidenceGaps: [],
          });
        }
        return response({
          thesis: "其余专家支持继续核验",
          investmentValue: "继续跟踪",
          confidence: "中",
          citationIds: ["evidence:1"],
          chief: {
            summary: "主审完成",
            findings: [],
            citationIds: ["evidence:1"],
            confidence: "中",
            evidenceGaps: [],
          },
          catalysts: [],
          risks: [],
          verificationQuestions: ["补充风险证据"],
        });
      },
    );

    expect(result.thesis).toBe("其余专家支持继续核验");
    expect(result.stages.find((stage) => stage.id === "risk")).toMatchObject({
      confidence: "低",
      findings: [],
    });
    expect(progress).toContainEqual(expect.objectContaining({
      type: "agent_done",
      displayName: "风险 Agent",
      success: false,
    }));
    expect(progress.at(-1)?.type).toBe("generating");
  });

  it("uses a conservative evidence summary when the chief JSON stays incomplete", async () => {
    const result = await runDeepResearchTeam(
      facts,
      { question: "研究价值", depth: "standard" },
      { apiKey: "test", model: "test-model" },
      async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const payload = JSON.parse(request.messages[1]!.content) as { task: string; role?: { id?: string } };
        if (payload.task === "研究规划") return researchPlanResponse();
        if (payload.task === "主审交叉验证") return rawResponse("{\"thesis\":\"主审被截断");
        return response({
          id: payload.role?.id,
          summary: "专家已完成",
          findings: [{ statement: "存在业务关联", citationIds: ["evidence:1"] }],
          citationIds: ["evidence:1"],
          confidence: "中",
          evidenceGaps: [],
        });
      },
    );

    expect(result.confidence).toBe("低");
    expect(result.thesis).toContain("主审结构化输出不可用");
    expect(result.citations).toEqual([expect.objectContaining({ id: "evidence:1" })]);
  });

  it("returns structured markdown report output", async () => {
    const progress: string[] = [];
    const report = await generateResearchReport(facts, null, { reportType: "company", focus: "核心业务", onProgress: (event) => progress.push(event.phase) }, { apiKey: "test", model: "test-model" }, () => response({
      title: "示例公司研究报告",
      executiveSummary: "摘要",
      sections: [{
        title: "投资摘要",
        claims: [
          { text: "公司产品用于机器人相关环节", citationIds: ["evidence:1"] },
          { text: "无依据的精确市场份额为90%", citationIds: ["made-up:1"] },
        ],
      }],
    }));
    expect(report.title).toContain("示例公司");
    expect(report.markdown).toContain("## 投资摘要");
    expect(report.markdown).toContain("[evidence:1]");
    expect(report.markdown).not.toContain("90%");
    expect(report.citations).toHaveLength(1);
    expect(report.quality.unsupportedClaimCount).toBe(1);
    expect(progress).toEqual(["outline", "evidence", "analysis", "drafting", "quality", "rendering"]);
  });

  it("rejects free-form markdown that bypasses structured citation checks", async () => {
    const report = await generateResearchReport(facts, null, { reportType: "company", focus: "核心业务" }, { apiKey: "test", model: "test-model" }, () => response({
      title: "示例公司研究报告",
      markdown: "# 示例公司研究报告\n\n公司拥有未经证实的绝对领先市场份额。",
    }));
    expect(report.markdown).not.toContain("绝对领先市场份额");
    expect(report.markdown).toContain("待补：当前证据目录不足以支持本节结论。");
    expect(report.citations).toEqual([]);
  });
});
