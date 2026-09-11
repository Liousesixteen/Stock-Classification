import { NextResponse } from "next/server";
import {
  cancelResearchExecution,
  waitForResearchExecutionToFinish,
} from "@/lib/research/researchExecutionRegistry";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const cancelled = cancelResearchExecution(sessionId);
  if (cancelled) await waitForResearchExecutionToFinish(sessionId);
  return cancelled
    ? NextResponse.json({ cancelled: true })
    : NextResponse.json({ cancelled: false, error: "当前会话没有正在执行的研究" }, { status: 409 });
}
