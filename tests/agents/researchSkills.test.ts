import { describe, expect, it } from "vitest";
import {
  inferResearchSkillIds,
  RESEARCH_SKILLS,
  resolveResearchSkills,
} from "@/lib/agents/researchSkills";

describe("DA-Stock research skills", () => {
  it("keeps all fifteen built-in DA-Stock strategies", () => {
    expect(RESEARCH_SKILLS).toHaveLength(15);
    expect(RESEARCH_SKILLS.map((skill) => skill.id)).toEqual(expect.arrayContaining([
      "chan_theory",
      "ma_golden_cross",
      "wave_theory",
      "box_oscillation",
      "emotion_cycle",
      "dragon_head",
    ]));
  });

  it("routes Chinese strategy aliases before the default selection", () => {
    expect(inferResearchSkillIds("用金叉分析华天科技")).toEqual(["ma_golden_cross"]);
    expect(inferResearchSkillIds("请做缠论分析和波浪理论分析")).toEqual([
      "chan_theory",
      "wave_theory",
    ]);
    expect(inferResearchSkillIds("华天科技怎么样")).toEqual([]);
    expect(inferResearchSkillIds("分析大盘的技术趋势和后续走势")).toEqual([]);
  });

  it("deduplicates and bounds selected skills", () => {
    expect(resolveResearchSkills([
      "chan_theory",
      "chan_theory",
      "ma_golden_cross",
      "wave_theory",
      "box_oscillation",
    ]).map((skill) => skill.id)).toEqual([
      "chan_theory",
      "ma_golden_cross",
      "wave_theory",
    ]);
  });
});
