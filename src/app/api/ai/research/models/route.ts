import { NextResponse } from "next/server";
import { runDAStockEngine } from "@/lib/research/daStockEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await runDAStockEngine({ operation: "catalog" });
  const configured = (Array.isArray(catalog.models) ? catalog.models : []).map((model) => {
    const row = model as Record<string, unknown>;
    return { ...row, model: String(row.model || ""), deploymentId: row.deployment_id, apiBase: row.api_base,
      isPrimary: row.is_primary, configured: true };
  });
  const primaryModel = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
  const primary = {
    deploymentId: "project:deepseek-primary", deployment_id: "project:deepseek-primary",
    model: primaryModel, provider: "deepseek", source: "project_environment",
    apiBase: process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    api_base: process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    isPrimary: true, is_primary: true, is_fallback: false,
    configured: Boolean(process.env.DEEPSEEK_API_KEY),
  };
  const models = [primary, ...configured.filter((model) => model.model !== primaryModel || model.isPrimary !== true)];
  return NextResponse.json({
    models,
  }, { headers: { "Cache-Control": "no-store" } });
}
