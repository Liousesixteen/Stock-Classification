import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { getResearchQueue } from "@/lib/repositories/researchQueue";
import {
  completeResearchTask,
  dismissResearchTask,
  getResearchTask,
  startResearchTask,
  syncAutomaticResearchTasks,
} from "@/lib/repositories/researchTasks";
import { enqueueCompanyProfileSyncTask } from "@/lib/research/companySyncQueue";
import { runSyncTaskWithRetries } from "@/lib/research/syncTaskWorker";
import { withApiObservability } from "@/lib/operations/observability";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getResearchQueue(getDatabase()), { headers: { "Cache-Control": "no-store" } });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reconcile") }),
  z.object({
    taskId: z.number().int().positive(),
    action: z.enum(["start", "complete", "dismiss", "retry"]),
    resolution: z.string().trim().max(500).optional(),
  }),
]);

async function postTaskAction(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "任务操作无效" }, { status: 400 });
  }
  const db = getDatabase();
  if (parsed.data.action === "reconcile") {
    syncAutomaticResearchTasks(db);
    return NextResponse.json({ queue: getResearchQueue(db) });
  }
  const current = getResearchTask(db, parsed.data.taskId);
  if (!current) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  try {
    if (parsed.data.action === "retry") {
      if (!current.stockCode) return NextResponse.json({ error: "该任务没有可重试的公司目标" }, { status: 409 });
      const queued = enqueueCompanyProfileSyncTask(db, {
        stockCode: current.stockCode,
        categoryId: current.categoryId ?? undefined,
        force: true,
      });
      startResearchTask(db, current.id);
      after(async () => {
        await runSyncTaskWithRetries(queued.task.id).catch(() => undefined);
      });
      return NextResponse.json({ task: getResearchTask(db, current.id), syncTask: queued.task }, { status: 202 });
    }
    const task = parsed.data.action === "start"
      ? startResearchTask(db, current.id)
      : parsed.data.action === "dismiss"
        ? dismissResearchTask(db, current.id, parsed.data.resolution ?? "")
        : completeResearchTask(db, current.id, parsed.data.resolution ?? "");
    return NextResponse.json({ task, queue: getResearchQueue(db) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "任务操作失败" },
      { status: 409 },
    );
  }
}

export const POST = withApiObservability("research.task.action", postTaskAction, { audit: true });
