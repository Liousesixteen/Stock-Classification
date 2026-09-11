import { NextResponse } from "next/server";
import { runDAStockEngine } from "@/lib/research/daStockEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await runDAStockEngine({ operation: "catalog" });
  const rows = Array.isArray(catalog.providers)
    ? catalog.providers as Array<{ enabled?: boolean }>
    : [];
  return NextResponse.json({
    configured: rows.some((provider) => provider.enabled),
    providerCount: rows.length,
    enabledCount: rows.filter((provider) => provider.enabled).length,
    providers: rows,
    error: "",
    engine: "local-research-engine",
  }, { headers: { "Cache-Control": "no-store" } });
}
