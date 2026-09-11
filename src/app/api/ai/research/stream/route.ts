import {
  ResearchRequestError,
  type ResearchRequestBody,
} from "@/lib/research/executeResearch";
import { executeDAStockResearch as executeResearch } from "@/lib/research/executeDAStockResearch";
import {
  beginResearchExecution,
  finishResearchExecution,
} from "@/lib/research/researchExecutionRegistry";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ResearchRequestBody;
  const sessionId = typeof body.sessionId === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(body.sessionId)
    ? body.sessionId
    : crypto.randomUUID();
  body.sessionId = sessionId;
  const execution = beginResearchExecution(sessionId);
  if (!execution) {
    return Response.json(
      { error: "该会话已有研究正在执行，请等待完成或先停止当前研究" },
      { status: 409 },
    );
  }
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      heartbeat = setInterval(() => {
        send({ type: "heartbeat", createdAt: new Date().toISOString() });
      }, 10_000);

      void executeResearch(body, {
        onProgress: (event) => send({ type: "progress", event }),
        signal: execution.controller.signal,
      }).then((outcome) => {
        send({ type: "done", ...outcome });
      }).catch((error) => {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "AI 研究失败",
          status: error instanceof ResearchRequestError ? error.status : 502,
        });
      }).finally(() => {
        if (heartbeat) clearInterval(heartbeat);
        finishResearchExecution(execution);
        if (!closed) {
          closed = true;
          controller.close();
        }
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      execution.controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
