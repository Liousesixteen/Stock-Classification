export type ResearchProgressEvent = {
  type: "thinking" | "tool_start" | "tool_done" | "agent_start" | "agent_done" | "generating";
  step: number;
  message: string;
  tool?: string;
  stageId?: string;
  displayName?: string;
  success?: boolean;
  durationMs?: number;
  createdAt: string;
};

export function createResearchProgressEvent(
  event: Omit<ResearchProgressEvent, "createdAt">,
): ResearchProgressEvent {
  return { ...event, createdAt: new Date().toISOString() };
}
