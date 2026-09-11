type ActiveResearchExecution = {
  controller: AbortController;
  startedAt: string;
};

const activeExecutions = new Map<string, ActiveResearchExecution>();

export type ResearchExecutionHandle = ActiveResearchExecution & {
  sessionId: string;
};

export function beginResearchExecution(sessionId: string): ResearchExecutionHandle | null {
  const current = activeExecutions.get(sessionId);
  if (current && !current.controller.signal.aborted) return null;
  if (current) activeExecutions.delete(sessionId);

  const execution: ActiveResearchExecution = {
    controller: new AbortController(),
    startedAt: new Date().toISOString(),
  };
  activeExecutions.set(sessionId, execution);
  return { sessionId, ...execution };
}

export function finishResearchExecution(handle: ResearchExecutionHandle) {
  const current = activeExecutions.get(handle.sessionId);
  if (current?.controller === handle.controller) activeExecutions.delete(handle.sessionId);
}

export function cancelResearchExecution(sessionId: string) {
  const execution = activeExecutions.get(sessionId);
  if (!execution) return false;
  execution.controller.abort();
  return true;
}

export function getResearchExecutionStatus(sessionId: string) {
  const execution = activeExecutions.get(sessionId);
  if (!execution || execution.controller.signal.aborted) return { active: false, startedAt: "" };
  return { active: true, startedAt: execution.startedAt };
}

export async function waitForResearchExecutionToFinish(sessionId: string, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  // An aborted execution is no longer "active" to API consumers, but its
  // catch/finally path may still be persisting the cancellation message.
  // Wait for the registry entry itself to be removed by finishResearchExecution.
  while (activeExecutions.has(sessionId) && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  return !activeExecutions.has(sessionId);
}
