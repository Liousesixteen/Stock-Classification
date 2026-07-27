import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
    model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat",
    profileProvidersEnabled: (process.env.STOCK_PROFILE_SOURCE_PRIORITY?.trim() || "disabled") !== "disabled",
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
