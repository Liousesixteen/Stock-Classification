import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { runQualityChecks } from "@/lib/quality/checks";

export async function GET() {
  const db = getDatabase();
  return NextResponse.json({ checks: runQualityChecks(db) });
}
