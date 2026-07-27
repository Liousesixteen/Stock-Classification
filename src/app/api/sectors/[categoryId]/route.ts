import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { getDefaultSectorCategoryId, getSectorResearch } from "@/lib/repositories/sectorResearch";

type RouteContext = { params: Promise<{ categoryId: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  const { categoryId: rawCategoryId } = await context.params;
  const db = getDatabase();
  const categoryId = rawCategoryId === "default" ? getDefaultSectorCategoryId(db) : Number(rawCategoryId);
  if (!categoryId || !Number.isInteger(categoryId)) return NextResponse.json({ error: "赛道不存在" }, { status: 404 });
  const sector = getSectorResearch(db, categoryId);
  if (!sector) return NextResponse.json({ error: "赛道不存在" }, { status: 404 });
  return NextResponse.json(sector, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=300" } });
}
