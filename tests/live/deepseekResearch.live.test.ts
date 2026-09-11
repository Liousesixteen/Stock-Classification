import { describe, expect, it } from "vitest";
import { runDeepResearchTeam } from "@/lib/agents/deepseekResearchAgent";
import { getDatabase } from "@/lib/db/client";
import { buildCompanyResearchFacts } from "@/lib/research/companyFacts";

const enabled = process.env.RUN_LIVE_DEEPSEEK_TESTS === "1";

describe.skipIf(!enabled)("DeepSeek research live acceptance", () => {
  it("returns parseable structured research for the requested company", async () => {
    const stockCode = process.env.LIVE_RESEARCH_STOCK_CODE ?? "002185";
    const question = process.env.LIVE_RESEARCH_QUESTION ?? "华天科技怎么样";
    const facts = buildCompanyResearchFacts(getDatabase(), stockCode, null);
    expect(facts).toBeTruthy();
    const attempts: Array<Record<string, unknown>> = [];

    let result;
    try {
      result = await runDeepResearchTeam(
        facts!,
        { question, depth: "quick", skills: [] },
        {},
        async (input, init) => {
        const request = JSON.parse(String(init?.body)) as {
          messages?: Array<{ content?: string }>;
          max_tokens?: number;
        };
        const response = await fetch(input, init);
        const payload = await response.clone().json() as {
          choices?: Array<{
            finish_reason?: string;
            message?: { content?: string; reasoning_content?: string };
          }>;
          usage?: Record<string, unknown>;
          error?: { message?: string };
        };
        const choice = payload.choices?.[0];
        const content = choice?.message?.content ?? "";
        attempts.push({
          status: response.status,
          requestChars: request.messages?.reduce((sum, message) => sum + (message.content?.length ?? 0), 0),
          maxTokens: request.max_tokens,
          finishReason: choice?.finish_reason ?? "",
          contentChars: content.length,
          reasoningChars: choice?.message?.reasoning_content?.length ?? 0,
          contentStart: content.slice(0, 500),
          contentEnd: content.slice(-500),
          usage: payload.usage,
          error: payload.error?.message ?? "",
        });
          return response;
        },
      );
    } finally {
      console.log(JSON.stringify(attempts, null, 2));
    }

    expect(result.model).not.toBe("evidence-fallback");
    expect(result.citations?.length).toBeGreaterThan(0);
    expect(result.analysisSections?.length).toBeGreaterThanOrEqual(6);
    expect(result.analysisSections?.reduce((sum, section) => sum + section.findings.length, 0)).toBeGreaterThanOrEqual(10);
    expect(result.decisionDashboard?.signal.length).toBeGreaterThan(0);
    expect(result.decisionDashboard?.watchConditions.length).toBeGreaterThanOrEqual(3);
    expect(resultToPlainText(result).length).toBeGreaterThan(600);
  }, 150_000);
});

function resultToPlainText(result: Awaited<ReturnType<typeof runDeepResearchTeam>>) {
  return [
    result.thesis,
    result.investmentValue,
    ...(result.analysisSections ?? []).flatMap((section) => [section.summary, ...section.findings]),
    ...(result.decisionDashboard
      ? [
          result.decisionDashboard.signal,
          result.decisionDashboard.noPosition,
          result.decisionDashboard.hasPosition,
          ...result.decisionDashboard.watchConditions,
        ]
      : []),
  ].join("\n");
}
