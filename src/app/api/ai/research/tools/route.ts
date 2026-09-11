import { NextResponse } from "next/server";
import { localizeCatalogTool, runDAStockEngine } from "@/lib/research/daStockEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await runDAStockEngine({ operation: "catalog" });
  const tools = Array.isArray(catalog.tools)
    ? (catalog.tools as Array<Record<string, unknown>>).map(localizeCatalogTool)
    : [];
  return NextResponse.json({ tools }, { headers: { "Cache-Control": "no-store" } });
}
