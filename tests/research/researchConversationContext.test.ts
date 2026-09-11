import { describe, expect, it } from "vitest";
import {
  buildResearchConversationContext,
  isCompressedResearchContext,
} from "@/lib/research/researchConversationContext";

const history = Array.from({ length: 12 }, (_, index) => ({
  role: index % 2 === 0 ? "user" as const : "assistant" as const,
  content: `第 ${index + 1} 条会话内容`,
}));

describe("research conversation context", () => {
  it("keeps a bounded recent window when compression is disabled", () => {
    const context = buildResearchConversationContext(history, { compressionEnabled: false });
    expect(context).toHaveLength(8);
    expect(context[0]?.content).toContain("第 5 条");
    expect(isCompressedResearchContext(context)).toBe(false);
  });

  it("summarizes old turns and protects the latest three turns when enabled", () => {
    const context = buildResearchConversationContext(history, {
      compressionEnabled: true,
      protectedTurns: 3,
    });
    expect(context[0]).toMatchObject({ role: "user" });
    expect(context[0]?.content).toContain("历史对话摘要");
    expect(context[1]).toMatchObject({ role: "assistant", content: expect.stringContaining("历史摘要") });
    expect(context.slice(2)).toEqual(history.slice(-6));
    expect(isCompressedResearchContext(context)).toBe(true);
  });
});
