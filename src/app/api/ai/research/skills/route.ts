import { NextResponse } from "next/server";
import { runDAStockEngine } from "@/lib/research/daStockEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await runDAStockEngine({ operation: "catalog" });
  return NextResponse.json({
    skills: catalog.skills,
    defaultSkillId: catalog.defaultSkillId,
    default_skill_id: catalog.defaultSkillId,
  });
}
