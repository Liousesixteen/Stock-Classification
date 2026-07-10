import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { buildIndustryGraph } from "@/lib/industry-graph/adapter";
import { getCategoryTree } from "@/lib/repositories/categories";
import { listIndustryGraphRelations } from "@/lib/repositories/industryGraph";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDatabase();
  const graph = buildIndustryGraph(getCategoryTree(db), listIndustryGraphRelations(db));

  return NextResponse.json(graph, {
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=300",
    },
  });
}
