export type ConversationTurn = { role: "user" | "assistant"; content: string };

const SUMMARY_PREFIX = "[系统生成的历史对话摘要，仅供延续本会话]";

export function buildResearchConversationContext(
  history: ConversationTurn[],
  options: { compressionEnabled: boolean; protectedTurns?: number } = { compressionEnabled: false },
) {
  const sanitized = history
    .map((message) => ({ role: message.role, content: message.content.trim() }))
    .filter((message) => message.content);
  if (!options.compressionEnabled) return sanitized.slice(-8);

  const protectedMessages = Math.max(2, (options.protectedTurns ?? 3) * 2);
  if (sanitized.length <= protectedMessages) return sanitized;
  const older = sanitized.slice(0, -protectedMessages);
  const recent = sanitized.slice(-protectedMessages);
  const summary = older
    .map((message) => `${message.role === "user" ? "用户" : "AI"}：${compactLine(message.content)}`)
    .join("\n")
    .slice(0, 3_600);
  return [
    { role: "user" as const, content: `${SUMMARY_PREFIX}\n${summary}` },
    { role: "assistant" as const, content: "已读取历史摘要，将结合最近对话继续研究。" },
    ...recent,
  ];
}

export function isCompressedResearchContext(history: ConversationTurn[]) {
  return history.some((message) => message.content.startsWith(SUMMARY_PREFIX));
}

function compactLine(value: string) {
  return value.replace(/\s+/g, " ").slice(0, 520);
}
