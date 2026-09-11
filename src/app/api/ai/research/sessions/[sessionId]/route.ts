import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { deleteResearchSession, getResearchSession } from "@/lib/repositories/aiResearch";
import { getResearchExecutionStatus } from "@/lib/research/researchExecutionRegistry";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const payload = getResearchSession(getDatabase(), sessionId);
  return payload
    ? NextResponse.json({ ...payload, execution: getResearchExecutionStatus(sessionId) })
    : NextResponse.json({ error: "研究会话不存在" }, { status: 404 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const deleted = deleteResearchSession(getDatabase(), sessionId);
  return deleted
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "研究会话不存在" }, { status: 404 });
}
