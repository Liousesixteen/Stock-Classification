import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiObservability } from "@/lib/operations/observability";

const shareSchema = z.object({
  content: z.string().trim().min(1).max(50_000),
  title: z.string().trim().max(120).optional(),
});

async function shareResearch(request: Request) {
  const parsed = shareSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "分享内容无效" }, { status: 400 });
  const webhookUrl = process.env.AI_RESEARCH_SHARE_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return NextResponse.json({ error: "尚未配置 AI 研究分享 Webhook" }, { status: 400 });
  }
  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    return NextResponse.json({ error: "AI 研究分享 Webhook 配置无效" }, { status: 500 });
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) {
    return NextResponse.json({ error: "分享 Webhook 必须使用 HTTPS" }, { status: 500 });
  }

  const text = parsed.data.title
    ? `# ${parsed.data.title}\n\n${parsed.data.content}`
    : parsed.data.content;
  const format = process.env.AI_RESEARCH_SHARE_WEBHOOK_FORMAT?.trim().toLowerCase() || "generic";
  const body = format === "feishu"
    ? { msg_type: "text", content: { text } }
    : format === "wechat"
      ? { msgtype: "text", text: { content: text } }
      : { title: parsed.data.title || "AI 研究会话", content: parsed.data.content };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: `分享渠道返回 ${response.status}` }, { status: 502 });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "TimeoutError"
      ? "分享渠道响应超时"
      : "分享渠道暂时无法连接";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export const POST = withApiObservability("ai.research.share", shareResearch, { audit: true });
