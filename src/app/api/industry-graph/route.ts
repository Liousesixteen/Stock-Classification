import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { buildIndustryGraph } from "@/lib/industry-graph/adapter";
import { getCategoryTree } from "@/lib/repositories/categories";
import { listIndustryGraphRelations } from "@/lib/repositories/industryGraph";
import { listIndustryGraphEntityRelations } from "@/lib/repositories/graphEntities";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDatabase();
    const graph = buildIndustryGraph(getCategoryTree(db), listIndustryGraphRelations(db), listIndustryGraphEntityRelations(db));

    return NextResponse.json(graph, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[industry-graph]", error);
    return NextResponse.json({ error: "图谱数据加载失败" }, { status: 500 });
  }
}
