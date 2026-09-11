import { describe, expect, it } from "vitest";
import {
  beginResearchExecution,
  cancelResearchExecution,
  finishResearchExecution,
  getResearchExecutionStatus,
  waitForResearchExecutionToFinish,
} from "@/lib/research/researchExecutionRegistry";

describe("research execution registry", () => {
  it("prevents duplicate execution and releases the session after completion", () => {
    const first = beginResearchExecution("session-registry-complete");
    expect(first).not.toBeNull();
    expect(beginResearchExecution("session-registry-complete")).toBeNull();
    expect(getResearchExecutionStatus("session-registry-complete")).toMatchObject({ active: true });

    finishResearchExecution(first!);

    expect(getResearchExecutionStatus("session-registry-complete")).toEqual({ active: false, startedAt: "" });
    const next = beginResearchExecution("session-registry-complete");
    expect(next).not.toBeNull();
    finishResearchExecution(next!);
  });

  it("aborts the server-side execution when a session is cancelled", () => {
    const execution = beginResearchExecution("session-registry-cancel");
    expect(execution?.controller.signal.aborted).toBe(false);

    expect(cancelResearchExecution("session-registry-cancel")).toBe(true);
    expect(execution?.controller.signal.aborted).toBe(true);
    expect(getResearchExecutionStatus("session-registry-cancel")).toEqual({ active: false, startedAt: "" });
    expect(cancelResearchExecution("missing-session")).toBe(false);

    finishResearchExecution(execution!);
  });

  it("waits for the cancelled execution to finish its persistence path", async () => {
    const execution = beginResearchExecution("session-registry-persist-cancel");
    cancelResearchExecution("session-registry-persist-cancel");

    let settled = false;
    const waiting = waitForResearchExecutionToFinish("session-registry-persist-cancel", 500)
      .then((finished) => {
        settled = true;
        return finished;
      });
    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    expect(settled).toBe(false);

    finishResearchExecution(execution!);
    await expect(waiting).resolves.toBe(true);
  });
});
