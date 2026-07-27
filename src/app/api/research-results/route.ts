import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { listResearchResults, setResearchArtifactState } from "@/lib/repositories/researchResults";
import { withApiObservability } from "@/lib/operations/observability";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listResearchResults(getDatabase()));
}

const stateSchema = z.object({
  artifactId: z.string().trim().min(1).max(120),
  archived: z.boolean().optional(),
  pinned: z.boolean().optional(),
}).refine((value) => value.archived !== undefined || value.pinned !== undefined, {
  message: "缺少成果状态",
});

async function patchArtifactState(request: Request) {
  const parsed = stateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "成果状态无效" }, { status: 400 });
  }
  const artifact = setResearchArtifactState(getDatabase(), parsed.data.artifactId, {
    archived: parsed.data.archived,
    pinned: parsed.data.pinned,
  });
  if (!artifact) return NextResponse.json({ error: "成果不存在" }, { status: 404 });
  return NextResponse.json({ artifact });
}

export const PATCH = withApiObservability("research.artifact.update", patchArtifactState, { audit: true });
