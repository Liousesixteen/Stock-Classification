export type BackgroundSyncStatus = {
  state: "syncing" | "done" | "failed";
  message: string;
};

export type WorkbenchMode = "research" | "results" | "queue" | "sector" | "atlas";
