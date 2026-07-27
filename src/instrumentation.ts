export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NODE_ENV === "test") return;
    if (process.env.STOCK_SYNC_DISPATCHER_ENABLED === "false") return;

    const { startSyncTaskDispatcher } = await import("@/lib/research/syncTaskDispatcher");
    startSyncTaskDispatcher();
  }
}
