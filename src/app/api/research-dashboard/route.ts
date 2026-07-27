import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { getResearchDashboard } from "@/lib/repositories/researchDashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getResearchDashboard(getDatabase()), {
    headers: { "Cache-Control": "no-store" },
  });
}
