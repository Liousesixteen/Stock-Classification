import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { listResearchSessions } from "@/lib/repositories/aiResearch";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(requested) ? requested : 50;
  return NextResponse.json({ sessions: listResearchSessions(getDatabase(), limit) });
}
