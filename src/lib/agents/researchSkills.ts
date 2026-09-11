export type ResearchSkill = {
  id: string;
  name: string;
  description: string;
  category: "trend" | "framework" | "pattern" | "reversal";
  aliases: string[];
  requiredData: string[];
  instructions: string;
};

// Built-in strategy catalogue. The current application keeps the strategy
// contract in TypeScript so it can share the same Provider and evidence model.
export const RESEARCH_SKILLS: ResearchSkill[] = [
  {
    id: "bull_trend",
    name: "多头趋势",
    description: "识别多头排列、趋势延续与回踩低吸机会",
    category: "trend",
    aliases: ["趋势", "趋势分析", "多头趋势"],
    requiredData: ["日线", "均线", "量价"],
    instructions: "检查 MA5/MA10/MA20 排列、MA20 斜率、价格乖离和突破量能。优先回踩不破而非高位追涨；没有趋势优势时明确观望，并给出结构失效条件。",
  },
  {
    id: "chan_theory",
    name: "缠论",
    description: "按分型、笔、线段与中枢判断趋势和背驰",
    category: "framework",
    aliases: ["缠论", "缠论分析"],
    requiredData: ["60日日线", "MACD", "高低点"],
    instructions: "按分型→笔→线段→中枢→趋势分析。判断中枢或趋势段、顶底背驰以及一二三类买卖点；若数据不足以形成严格笔段结构，必须明确写无法确认。",
  },
  {
    id: "wave_theory",
    name: "波浪理论",
    description: "识别推动浪、调整浪与斐波那契位置",
    category: "framework",
    aliases: ["波浪", "波浪理论", "艾略特"],
    requiredData: ["120日日线", "MACD", "量能"],
    instructions: "识别 1-3-5 推动浪与 A-B-C 调整浪，检查第3浪不得最短、第4浪不得侵入第1浪等约束。波浪计数具有主观性，必须提供备选计数与置信度。",
  },
  {
    id: "box_oscillation",
    name: "箱体震荡",
    description: "识别箱体支撑、阻力、当前位置和真假突破",
    category: "framework",
    aliases: ["箱体", "箱体震荡"],
    requiredData: ["120日日线", "支撑阻力", "成交量"],
    instructions: "顶部和底部至少各有 2~3 次触碰才确认箱体。判断现价位于箱底、箱中或箱顶，并以连续收盘和放量验证突破；无法确认边界时不得给出精确价位。",
  },
  {
    id: "emotion_cycle",
    name: "情绪周期",
    description: "结合换手率、量价和信息热度判断情绪阶段",
    category: "framework",
    aliases: ["情绪", "情绪周期"],
    requiredData: ["换手率", "20日量价", "公告新闻"],
    instructions: "判断冷淡、平稳、升温、过热或狂热阶段。用换手率、量能脉冲、乖离和信息密度交叉验证；不可把单日上涨直接等同于情绪启动。",
  },
  {
    id: "growth_quality",
    name: "成长质量",
    description: "结合收入利润、ROE、现金流和行业空间判断成长",
    category: "framework",
    aliases: ["成长", "成长股", "成长质量"],
    requiredData: ["财务报表", "估值", "行业证据"],
    instructions: "检查收入、利润、经营现金流和 ROE 是否同向，区分增收不增利和一次性因素。高估值必须由持续增长证据支撑，否则降低置信度。",
  },
  {
    id: "event_driven",
    name: "事件驱动",
    description: "评估公告、政策、订单和产品事件的兑现路径",
    category: "framework",
    aliases: ["事件驱动", "催化", "催化事件"],
    requiredData: ["公告", "事件日期", "市场反应"],
    instructions: "区分业绩、政策、订单产品、资本运作和监管风险，说明影响路径、兑现周期、可信度和价格反映程度，并列出明确失效条件。",
  },
  {
    id: "expectation_repricing",
    name: "预期重估",
    description: "寻找预期差修复、兑现和落空风险",
    category: "framework",
    aliases: ["预期", "预期差", "预期重估"],
    requiredData: ["公告研报", "财务估值", "价格趋势"],
    instructions: "区分硬信息与软信息，判断正向预期差、预期兑现、负向预期差或预期不明。估值重估必须匹配盈利质量和增长持续性。",
  },
  {
    id: "hot_theme",
    name: "热点题材",
    description: "判断题材阶段、板块扩散和公司实质相关性",
    category: "framework",
    aliases: ["热点", "题材", "热点题材"],
    requiredData: ["板块表现", "业务证据", "量价"],
    instructions: "判断热点启动、扩散、分化或退潮，区分实质受益与概念关联。没有板块横向数据时只能给出待核验项，不能认定龙头。",
  },
  {
    id: "ma_golden_cross",
    name: "均线金叉",
    description: "检查均线交叉、趋势背景和量能确认",
    category: "trend",
    aliases: ["均线金叉", "金叉"],
    requiredData: ["20日日线", "均线", "MACD"],
    instructions: "检查 MA5 上穿 MA10、MA10 上穿 MA20 及 MACD 状态，结合金叉发生时间、量能和乖离率判断有效性。静态均线排列不能冒充近期金叉。",
  },
  {
    id: "volume_breakout",
    name: "放量突破",
    description: "识别关键阻力位的放量有效突破",
    category: "trend",
    aliases: ["放量突破", "突破"],
    requiredData: ["60日日线", "成交量", "阻力位"],
    instructions: "识别近期阻力位，要求收盘站上且量能相对均量明显放大，检查突破后的乖离和回踩。仅盘中触及不视为有效突破。",
  },
  {
    id: "shrink_pullback",
    name: "缩量回踩",
    description: "识别上升趋势中的缩量回踩与企稳",
    category: "trend",
    aliases: ["缩量回踩", "回踩"],
    requiredData: ["60日日线", "均线", "成交量"],
    instructions: "前提是上升趋势，检查价格回踩 MA5/MA10、回调量能收缩及结构企稳。跌破 MA20 或结构低点时判定失效。",
  },
  {
    id: "bottom_volume",
    name: "底部放量",
    description: "检测长期下跌后的底部放量反转线索",
    category: "reversal",
    aliases: ["地量见底", "底部放量"],
    requiredData: ["30日日线", "成交量", "公告"],
    instructions: "先确认持续下跌，再检查异常放量、阳线或长下影和近期低点支撑。这是高风险反转线索，不得仅凭单日放量确认见底。",
  },
  {
    id: "one_yang_three_yin",
    name: "一阳夹三阴",
    description: "检测整理后的五日 K 线延续形态",
    category: "pattern",
    aliases: ["一阳穿三阴", "一阳夹三阴"],
    requiredData: ["10日日线", "成交量", "均线"],
    instructions: "严格核验大阳线、三根缩量小阴线和第五日突破的五日结构，并结合趋势背景。任一 K 线条件缺失时写形态不成立。",
  },
  {
    id: "dragon_head",
    name: "龙头策略",
    description: "在板块轮动中识别领涨与相对强度",
    category: "trend",
    aliases: ["龙头", "龙头战法"],
    requiredData: ["板块排名", "相对强度", "换手率"],
    instructions: "检查板块是否共振、公司是否率先上涨、换手与量比是否活跃以及业务催化。没有板块比较数据时不得认定龙头。",
  },
];

export function resolveResearchSkills(ids: string[] | undefined, limit = 3) {
  const requested = [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))].slice(0, limit);
  return requested.flatMap((id) => {
    const skill = RESEARCH_SKILLS.find((item) => item.id === id);
    return skill ? [skill] : [];
  });
}

/**
 * A strategy explicitly named by the user has the highest
 * priority routing signal. Keep that behaviour even when the UI still carries
 * the default bull-trend selection from a previous turn.
 */
export function inferResearchSkillIds(value: string, limit = 3) {
  const normalized = value.trim().toLocaleLowerCase();
  if (!normalized) return [];

  return RESEARCH_SKILLS
    .map((skill, index) => ({
      skill,
      index,
      matchedLength: Math.max(
        0,
        ...[skill.name, ...skill.aliases]
          .map((alias) => alias.toLocaleLowerCase())
          .filter((alias) => isExplicitMethodMention(normalized, alias))
          .map((alias) => alias.length),
      ),
    }))
    .filter((item) => item.matchedLength > 0)
    .sort((left, right) => right.matchedLength - left.matchedLength || left.index - right.index)
    .slice(0, Math.max(0, limit))
    .map((item) => item.skill.id);
}

function isExplicitMethodMention(question: string, alias: string) {
  if (!question.includes(alias)) return false;
  // “趋势”“事件”“成长”等词通常是问题主题，而不是策略选择。
  // 只有明确的方法语气才自动激活，避免替用户悄悄勾选预设策略。
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const explicitCue = new RegExp(
    `(?:用|按|采用|运用|使用|基于|结合)[^，。；!?]{0,12}${escaped}|${escaped}(?:理论|方法|策略|战法|分析|研判|看)`,
    "i",
  );
  if (explicitCue.test(question)) return true;
  return alias.length >= 4;
}
