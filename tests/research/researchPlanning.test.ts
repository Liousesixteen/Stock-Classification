import { describe, expect, it } from "vitest";
import { RESEARCH_SKILLS } from "@/lib/agents/researchSkills";
import { buildFallbackResearchPlan, normalizeResearchPlan } from "@/lib/research/researchPlanning";
import type { CompanyResearchFacts } from "@/lib/agents/deepseekResearchAgent";

const facts = {
  subject: { kind: "company", key: "600584", label: "长电科技" },
  company: { stockCode: "600584", shortName: "长电科技" },
  relations: [],
  evidence: [],
  researchProfile: null,
  fieldFacts: [],
  dossierQuality: { overallScore: 0, reliabilityLabel: "待核验" },
  evidenceTimeline: [],
  graphRelations: [],
  notes: [],
} satisfies CompanyResearchFacts;

describe("dynamic research planning", () => {
  it("keeps every explicitly selected method at the front of the plan", () => {
    const skills = RESEARCH_SKILLS.filter((skill) => ["chan_theory", "wave_theory"].includes(skill.id));
    const plan = buildFallbackResearchPlan({ question: "分析长电科技", depth: "standard", skills, facts });

    expect(plan.tasks.slice(0, 2).map((task) => task.id)).toEqual([
      "skill:chan_theory",
      "skill:wave_theory",
    ]);
    expect(plan.answerLayout[0]).toMatchObject({ kind: "method", title: "所选方法联合判断" });
  });

  it("does not let a model-generated plan silently remove selected methods", () => {
    const skills = RESEARCH_SKILLS.filter((skill) => skill.id === "chan_theory");
    const plan = normalizeResearchPlan({
      objective: "仅做行业分析",
      tasks: [{ id: "industry", name: "行业 Agent", mission: "核验行业周期", kind: "domain" }],
      answerLayout: [{ id: "industry", title: "行业周期判断", kind: "analysis" }],
    }, { question: "分析长电科技", depth: "standard", skills, facts });

    expect(plan.tasks[0]).toMatchObject({ id: "skill:chan_theory", skillId: "chan_theory", kind: "method" });
    expect(plan.tasks.map((task) => task.id)).toContain("industry");
  });

  it("changes the answer layout with the question instead of forcing fixed chapters", () => {
    const plan = buildFallbackResearchPlan({
      question: "比较长电科技与通富微电的先进封装竞争力",
      depth: "deep",
      skills: [],
      facts,
    });

    expect(plan.answerLayout).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "comparison", kind: "comparison" }),
      expect.objectContaining({ id: "counter-case", kind: "risk" }),
    ]));
    expect(plan.answerLayout.map((block) => block.id)).not.toContain("next-checks");
    expect(plan.answerLayout.map((block) => block.title)).not.toContain("公司与核心业务");
  });

  it("keeps all selected methods in the single-call quick plan", () => {
    const skills = RESEARCH_SKILLS.filter((skill) => ["chan_theory", "wave_theory", "bull_trend"].includes(skill.id));
    const plan = buildFallbackResearchPlan({ question: "快速分析长电科技", depth: "quick", skills, facts });

    expect(plan.tasks.slice(0, 3).map((task) => task.skillId)).toEqual(skills.map((skill) => skill.id));
    expect(plan.tasks[3]?.kind).not.toBe("method");
  });

  it("plans a market review with index, breadth, rotation and scenario agents", () => {
    const plan = buildFallbackResearchPlan({
      question: "分析一下未来一周的大盘走势",
      depth: "deep",
      skills: [],
      facts: {
        ...facts,
        subject: { kind: "question", key: "market-cn", label: "A股大盘" },
        company: { subjectType: "market" },
      },
    });

    expect(plan.tasks.map((task) => task.id)).toEqual(expect.arrayContaining([
      "market-index-trend",
      "market-breadth-rotation",
      "market-catalyst-news",
      "market-counter-scenario",
    ]));
    expect(plan.answerLayout.map((block) => block.id)).toEqual(expect.arrayContaining([
      "market-state",
      "market-breadth",
      "market-drivers",
      "market-scenarios",
    ]));
    expect(plan.answerLayout.map((block) => block.id)).not.toContain("next-checks");
    expect(plan.answerLayout.map((block) => block.title)).not.toContain("公司与核心业务");
  });

  it("keeps a quick market answer compact instead of forcing the full market template", () => {
    const plan = buildFallbackResearchPlan({
      question: "分析一下大盘走势",
      depth: "quick",
      skills: [],
      facts: {
        ...facts,
        subject: { kind: "question", key: "market-cn", label: "A股大盘" },
        company: { subjectType: "market" },
      },
    });

    expect(plan.answerLayout.map((block) => block.id)).toEqual(["market-state", "market-scenarios"]);
    expect(plan.answerLayout).toHaveLength(2);
  });

  it("routes an open financial concept question to a direct knowledge answer", () => {
    const plan = buildFallbackResearchPlan({
      question: "什么是市盈率？请用适合初学者的方式解释，并举一个简单例子。",
      depth: "quick",
      skills: [],
      facts: {
        ...facts,
        subject: { kind: "question", key: "open-question", label: "开放金融问题" },
        company: { subjectType: "question" },
      },
    });

    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0]).toMatchObject({ id: "financial-knowledge", name: "金融知识解释 Agent" });
    expect(plan.answerLayout).toEqual([
      expect.objectContaining({ id: "direct-answer", title: "直接回答", question: expect.stringContaining("市盈率") }),
    ]);
    expect(plan.tasks.map((task) => task.id)).not.toContain("business-quality");
    expect(plan.tasks.map((task) => task.id)).not.toContain("counter-evidence");
  });
});
