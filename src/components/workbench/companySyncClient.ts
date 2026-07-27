import type { SyncTask } from "@/lib/repositories/syncTasks";

type CompanySyncResponse = {
  task?: SyncTask;
  error?: string;
};

type CompanySyncSnapshot = {
  latestSyncTask?: SyncTask | null;
  syncTasks?: SyncTask[];
};

type PollOptions = {
  attempts?: number;
  intervalMs?: number;
  onSnapshot?: (task: SyncTask, snapshot: CompanySyncSnapshot) => void;
};

export async function enqueueCompanyProfileSync(
  stockCode: string,
  input: { categoryId?: number; force?: boolean } = {},
) {
  const response = await fetch(`/api/companies/${encodeURIComponent(stockCode)}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = (await response.json().catch(() => ({}))) as CompanySyncResponse;
  if (!response.ok || !result.task) {
    throw new Error(result.error ?? "启动资料同步失败");
  }
  return result.task;
}

export async function pollCompanyProfileSync(
  stockCode: string,
  taskId: number,
  options: PollOptions = {},
) {
  const attempts = options.attempts ?? 45;
  const intervalMs = options.intervalMs ?? 650;
  let lastTask: SyncTask | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await delay(intervalMs);

    const response = await fetch(`/api/companies/${encodeURIComponent(stockCode)}`, {
      cache: "no-store",
    });
    if (!response.ok) continue;

    const snapshot = (await response.json()) as CompanySyncSnapshot;
    const task = snapshot.syncTasks?.find((item) => item.id === taskId)
      ?? (snapshot.latestSyncTask?.id === taskId ? snapshot.latestSyncTask : null);
    if (!task) continue;

    lastTask = task;
    options.onSnapshot?.(task, snapshot);
    if (task.status === "partial" || task.status === "success" || task.status === "failed") return task;
  }

  return lastTask;
}

function delay(durationMs: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, durationMs));
}
