import type Database from "better-sqlite3";
import { getDatabase } from "@/lib/db/client";
import { listRunnableSyncTaskIds } from "@/lib/repositories/syncTasks";
import { runSyncTaskWithRetries } from "./syncTaskWorker";

type DispatcherDependencies = {
  db?: Database.Database;
  runTask?: (taskId: number) => Promise<unknown>;
  now?: () => Date;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
};

type SyncTaskDispatcherOptions = {
  concurrency?: number;
  pollIntervalMs?: number;
  scanLimit?: number;
};

export class SyncTaskDispatcher {
  private readonly db: Database.Database;
  private readonly runTask: (taskId: number) => Promise<unknown>;
  private readonly now: () => Date;
  private readonly scheduleInterval: typeof globalThis.setInterval;
  private readonly cancelInterval: typeof globalThis.clearInterval;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly scanLimit: number;
  private readonly activeTaskIds = new Set<number>();
  private interval: ReturnType<typeof globalThis.setInterval> | null = null;
  private scanning = false;

  constructor(options: SyncTaskDispatcherOptions = {}, dependencies: DispatcherDependencies = {}) {
    this.db = dependencies.db ?? getDatabase();
    this.runTask = dependencies.runTask ?? ((taskId) => runSyncTaskWithRetries(taskId, { db: this.db }));
    this.now = dependencies.now ?? (() => new Date());
    this.scheduleInterval = dependencies.setInterval ?? globalThis.setInterval;
    this.cancelInterval = dependencies.clearInterval ?? globalThis.clearInterval;
    this.concurrency = positiveInteger(options.concurrency, 2, 1, 16);
    this.pollIntervalMs = positiveInteger(options.pollIntervalMs, 2_000, 250, 60_000);
    this.scanLimit = positiveInteger(options.scanLimit, 20, 1, 100);
  }

  start() {
    if (this.interval) return this;
    void this.tick();
    this.interval = this.scheduleInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
    if (typeof this.interval === "object" && "unref" in this.interval) {
      this.interval.unref();
    }
    return this;
  }

  stop() {
    if (this.interval) this.cancelInterval(this.interval);
    this.interval = null;
  }

  async tick() {
    if (this.scanning) return [];
    const capacity = this.concurrency - this.activeTaskIds.size;
    if (capacity <= 0) return [];

    this.scanning = true;
    try {
      const taskIds = listRunnableSyncTaskIds(this.db, {
        now: this.now(),
        limit: Math.min(this.scanLimit, capacity),
      }).filter((taskId) => !this.activeTaskIds.has(taskId));

      for (const taskId of taskIds) {
        this.activeTaskIds.add(taskId);
        void this.runTask(taskId)
          .catch(() => undefined)
          .finally(() => {
            this.activeTaskIds.delete(taskId);
          });
      }
      return taskIds;
    } finally {
      this.scanning = false;
    }
  }

  getActiveTaskIds() {
    return [...this.activeTaskIds];
  }
}

type DispatcherGlobal = typeof globalThis & {
  __stockClassificationSyncTaskDispatcher?: SyncTaskDispatcher;
};

export function startSyncTaskDispatcher() {
  const dispatcherGlobal = globalThis as DispatcherGlobal;
  if (dispatcherGlobal.__stockClassificationSyncTaskDispatcher) {
    return dispatcherGlobal.__stockClassificationSyncTaskDispatcher;
  }
  const dispatcher = new SyncTaskDispatcher({
    concurrency: readPositiveInteger(process.env.STOCK_SYNC_DISPATCHER_CONCURRENCY, 2),
    pollIntervalMs: readPositiveInteger(process.env.STOCK_SYNC_DISPATCHER_POLL_MS, 2_000),
    scanLimit: readPositiveInteger(process.env.STOCK_SYNC_DISPATCHER_SCAN_LIMIT, 20),
  });
  dispatcherGlobal.__stockClassificationSyncTaskDispatcher = dispatcher.start();
  return dispatcher;
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.round(value ?? fallback)));
}
