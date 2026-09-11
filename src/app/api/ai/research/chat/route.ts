import { NextResponse } from "next/server";
import { resolveStockMention, resolveStockQuery } from "@/lib/datasources/stockLookup";
import { getDatabase } from "@/lib/db/client";
import { getResearchSession } from "@/lib/repositories/aiResearch";
import {
  ResearchRequestError,
  type ResearchRequestBody,
} from "@/lib/research/executeResearch";
import { executeDAStockResearch as executeResearch } from "@/lib/research/executeDAStockResearch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type DAStockChatRequest = {
  message?: unknown;
  session_id?: unknown;
  sessionId?: unknown;
  skills?: unknown;
  strategies?: unknown;
  context?: unknown;
  contextCompression?: unknown;
  depth?: unknown;
};

// Non-streaming compatibility endpoint matching DA-Stock's /agent/chat shape.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as DAStockChatRequest;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ success: false, content: "", session_id: "", error: "研究问题不能为空" }, { status: 400 });

  const context = isRecord(body.context) ? body.context : {};
  const contextCode = typeof context.stock_code === "string" ? context.stock_code : "";
  const stock = resolveStockQuery(contextCode) ?? resolveStockMention(message);
  const sessionId = typeof body.session_id === "string"
    ? body.session_id
    : typeof body.sessionId === "string" ? body.sessionId : crypto.randomUUID();
  const existingSession = /^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)
    ? getResearchSession(getDatabase(), sessionId)?.session
    : undefined;
  const skills = Array.isArray(body.skills) ? body.skills : body.strategies;
  const inheritedTarget = !stock ? existingSession : undefined;
  const researchBody: ResearchRequestBody = {
    targetType: stock ? "company" : inheritedTarget?.targetType ?? "question",
    subjectKey: stock?.displayCode || inheritedTarget?.subjectKey || `question-${crypto.randomUUID()}`,
    subjectLabel: stock?.nameZh || inheritedTarget?.subjectLabel || message.slice(0, 80),
    stockCode: stock?.displayCode || inheritedTarget?.stockCode || "",
    categoryId: inheritedTarget?.categoryId ?? null,
    question: message,
    sessionId,
    skills: skills ?? inheritedTarget?.skills,
    context,
    contextCompression: typeof body.contextCompression === "boolean"
      ? body.contextCompression
      : inheritedTarget?.context.contextCompression === true,
    depth: body.depth ?? inheritedTarget?.depth,
  };

  try {
    const outcome = await executeResearch(researchBody, { signal: request.signal });
    if (!outcome.run.result) throw new ResearchRequestError("AI 研究未返回可用结论");
    return NextResponse.json({
      success: true,
      content: researchResultMarkdown(outcome.run.result),
      session_id: outcome.sessionId,
      error: null,
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "AI 研究失败";
    return NextResponse.json({ success: false, content: "", session_id: sessionId, error: messageText }, {
      status: error instanceof ResearchRequestError ? error.status : 502,
    });
  }
}

function researchResultMarkdown(result: NonNullable<Awaited<ReturnType<typeof executeResearch>>["run"]["result"]>) {
  if (result.answerMarkdown) return result.answerMarkdown;
  return [
    `## 联合结论（${result.confidence}置信）`,
    result.thesis,
    result.investmentValue,
    ...result.stages.flatMap((stage) => [`### ${stage.name}`, stage.summary, ...stage.findings.map((item) => `- ${item}`)]),
    "### 风险与反证",
    ...result.risks.map((item) => `- ${item}`),
    "### 下一步核验",
    ...result.verificationQuestions.map((item) => `- ${item}`),
  ].join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
