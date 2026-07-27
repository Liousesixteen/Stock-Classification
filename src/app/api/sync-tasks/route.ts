import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { createSyncTask, updateSyncTask } from "@/lib/repositories/syncTasks";
import { withApiObservability } from "@/lib/operations/observability";

const syncTaskCreateSchema = z.object({
  stockCode: z.string().regex(/^(00|30|60|68|83|87)\d{4}$/),
  taskType: z.string().trim().min(1).default("company_research_profile"),
  source: z.string().trim().default(""),
  status: z.enum(["pending", "running", "partial", "success", "failed"]),
  message: z.string().trim().default(""),
  error: z.string().trim().optional(),
});

const syncTaskUpdateSchema = z.object({
  taskId: z.number().int().positive(),
  status: z.enum(["pending", "running", "partial", "success", "failed"]),
  message: z.string().trim().default(""),
  error: z.string().trim().optional(),
});

async function postSyncTask(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const db = getDatabase();

  if (typeof body.taskId === "number") {
    const parsed = syncTaskUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "同步任务参数无效" }, { status: 400 });
    }

    updateSyncTask(db, parsed.data.taskId, {
      status: parsed.data.status,
      message: parsed.data.message,
      error: parsed.data.error,
    });
    return NextResponse.json({ taskId: parsed.data.taskId });
  }

  const parsed = syncTaskCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "同步任务参数无效" }, { status: 400 });
  }

  const taskId = createSyncTask(db, {
    stockCode: parsed.data.stockCode,
    taskType: parsed.data.taskType,
    source: parsed.data.source,
    status: parsed.data.status,
    message: parsed.data.message,
    error: parsed.data.error,
  });

  return NextResponse.json({ taskId }, { status: 201 });
}

export const POST = withApiObservability("sync.task.mutate", postSyncTask, { audit: true });
