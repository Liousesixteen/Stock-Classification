import { getDatabase } from "@/lib/db/client";
import { addResearchMessage, getResearchSession, saveUniversalResearchRun, upsertResearchSession } from "@/lib/repositories/aiResearch";
import type { DeepResearchResult, ResearchDepth } from "@/lib/agents/deepseekResearchAgent";
import type { ResearchRequestBody, ResearchRequestOutcome } from "./executeResearch";
import type { ResearchProgressEvent } from "./researchProgress";
import { runDAStockEngine } from "./daStockEngine";
import { sanitizePublicFacingPayload, sanitizePublicReportText } from "./publicReportBrand";

export async function executeDAStockResearch(body: ResearchRequestBody, options: {
  onProgress?: (event: ResearchProgressEvent) => void; signal?: AbortSignal;
} = {}): Promise<ResearchRequestOutcome> {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 50_000) throw new Error("请输入 1–50000 字的金融问题");
  const sessionId = typeof body.sessionId === "string" && /^[\w-]{8,80}$/.test(body.sessionId) ? body.sessionId : crypto.randomUUID();
  const db = getDatabase();
  const existing = getResearchSession(db, sessionId);
  const depth: ResearchDepth = body.depth === "quick" || body.depth === "deep" ? body.depth : "standard";
  const skills = Array.isArray(body.skills) ? body.skills.filter((s): s is string => typeof s === "string") : existing?.session.skills ?? [];
  const subjectKey = existing?.session.subjectKey || sessionId;
  const subjectLabel = existing?.session.subjectLabel || question.slice(0, 60);
  upsertResearchSession(db, { sessionId, title: existing?.session.title || question,
    targetType: "question", subjectKey, subjectLabel, stockCode: "", categoryId: null,
    depth, skills, context: { engine: "da-stock-source" } });
  const history = (existing?.messages ?? []).filter((m) => !m.content.startsWith("[研究失败]") && !m.content.startsWith("[研究已停止]"));
  addResearchMessage(db, { sessionId, role: "user", content: question });
  const progressEvents: ResearchProgressEvent[] = [];
  const started = Date.now();
  try {
    const outcome = await runDAStockEngine({
      message: question, session_id: sessionId, skills,
      depth,
      context_compression: body.contextCompression === true,
      history: history.map(({ role, content }) => ({ role, content })),
      context: body.context && typeof body.context === "object" ? body.context : {},
    }, { ...options, onProgress: (event) => {
      const publicEvent = sanitizePublicFacingPayload(event);
      progressEvents.push(publicEvent);
      options.onProgress?.(publicEvent);
    } });
    const content = typeof outcome.content === "string" ? sanitizePublicReportText(outcome.content) : "";
    if (!content.trim()) throw new Error("问股引擎未返回正文");
    const result: DeepResearchResult = sanitizePublicFacingPayload({
      answerMarkdown: content, thesis: "", investmentValue: "", confidence: "低", stages: [],
      catalysts: [], risks: [], verificationQuestions: [], evidenceBoundary: "", model: String(outcome.model || "da-stock"),
      execution: { mode: depth, agentCalls: Number(outcome.total_steps || 0), maxAgentCalls: Number(outcome.total_steps || 0),
        totalTokens: Number(outcome.total_tokens || 0), maxOutputTokens: 0, elapsedMs: Date.now() - started, timeoutMs: 900_000,
        skills, toolTrace: progressEvents.filter((e) => e.type === "tool_done").map((e) => ({
          tool: e.tool || "", status: e.success === false ? "unavailable" : "completed", detail: e.message,
        })) },
    });
    addResearchMessage(db, { sessionId, role: "assistant", content, metadata: { result, depth, skills, progressEvents } });
    const id = saveUniversalResearchRun(db, { subjectType: "question", subjectKey, subjectLabel, categoryId: null, question, depth, result });
    return { sessionId, run: { id, subjectType: "question", subjectKey, subjectLabel, categoryId: null, question, depth,
      status: "completed", model: result.model, result, error: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } };
  } catch (error) {
    const message = error instanceof Error ? sanitizePublicReportText(error.message) : "引擎未完成";
    addResearchMessage(db, { sessionId, role: "assistant", content: `[研究失败] ${message}`, metadata: { error: message, progressEvents } });
    throw error;
  }
}
