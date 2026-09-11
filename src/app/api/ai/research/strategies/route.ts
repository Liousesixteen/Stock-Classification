import { NextResponse } from "next/server";
import { RESEARCH_SKILLS } from "@/lib/agents/researchSkills";

export const dynamic = "force-dynamic";

// DA-Stock legacy compatibility alias. New clients should use /skills.
export async function GET() {
  return NextResponse.json({
    strategies: RESEARCH_SKILLS,
    defaultStrategyId: "bull_trend",
    default_strategy_id: "bull_trend",
    maxSelected: 3,
    max_selected: 3,
  });
}
