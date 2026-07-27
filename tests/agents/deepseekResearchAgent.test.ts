import { describe, expect, it } from "vitest";
import { generateResearchReport, runDeepResearchTeam, type CompanyResearchFacts } from "@/lib/agents/deepseekResearchAgent";

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

describe("deepseek research agent", () => {
  it("normalizes a five-role research result and keeps the configured model", async () => {
    const calls: string[] = [];
    const result = await runDeepResearchTeam(facts, { question: "研究价值", depth: "standard" }, { apiKey: "test", model: "test-model" }, async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const payload = JSON.parse(request.messages[1]!.content) as { task: string; role?: { id?: string } };
      calls.push(payload.task);
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
    expect(result.execution).toMatchObject({ mode: "standard", agentCalls: 5, totalTokens: 600 });
    expect(calls.filter((task) => task === "独立专家研判")).toHaveLength(4);
    expect(calls.at(-1)).toBe("主审交叉验证");
  });

  it("drops unsupported claims and uses one call in quick mode", async () => {
    let calls = 0;
    const result = await runDeepResearchTeam(facts, { question: "开放问题", depth: "quick" }, { apiKey: "test", model: "test-model" }, () => {
      calls += 1;
      return response({
        thesis: "没有合法引用的结论",
        confidence: "高",
        citationIds: ["made-up:99"],
        stages: [{ id: "business", summary: "无依据", findings: ["模型自由发挥"], confidence: "高", evidenceGaps: [] }],
        catalysts: ["无引用催化"],
        risks: [{ statement: "引用不存在", citationIds: ["made-up:99"] }],
        verificationQuestions: ["需要什么证据？"],
      });
    });
    expect(calls).toBe(1);
    expect(result.confidence).toBe("低");
    expect(result.thesis).toContain("没有足够");
    expect(result.citations).toEqual([]);
    expect(result.catalysts).toEqual(["催化因素待验证"]);
    expect(result.stages[0]?.findings).toEqual([]);
    expect(result.unsupportedClaimCount).toBeGreaterThan(0);
  });

  it("returns structured markdown report output", async () => {
    const report = await generateResearchReport(facts, null, { reportType: "company", focus: "核心业务" }, { apiKey: "test", model: "test-model" }, () => response({
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
