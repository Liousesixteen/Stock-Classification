export type BackgroundSyncStatus = {
  state: "syncing" | "done" | "failed";
  message: string;
};

export type WorkbenchMode = "rich" | "atlas" | "ai" | "report" | "account";

// LEGACY WORKSPACE MODES（按产品要求保留，不删除）：
// export type LegacyWorkbenchMode = "research" | "results" | "queue" | "sector";
