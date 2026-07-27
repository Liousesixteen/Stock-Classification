import type { CompanyResearchProfileInput } from "@/lib/repositories/researchProfiles";
import type { CompanyResearchProfile } from "@/lib/repositories/researchProfiles";

type RelationLike = {
  categoryName: string;
  relationType: string;
  confidence: string;
  rationale: string;
};

export type ResearchProfileDraftInput = {
  stockCode: string;
  shortName: string;
  industry: string;
  intro: string;
  mainBusiness: string;
  relations: RelationLike[];
  evidenceTitles: string[];
};

export type DisplayResearchProfileInput = {
  company: {
    stockCode: string;
    shortName: string;
    industry: string;
    intro: string;
    mainBusiness: string;
    updatedAt: string;
  };
  relations: RelationLike[];
  evidenceTitles: string[];
  existingProfile: CompanyResearchProfile | null;
};

export function buildResearchProfileDraft(input: ResearchProfileDraftInput): CompanyResearchProfileInput {
  const businessLines = extractBusinessLines(input.mainBusiness, input.industry);
  const relation = input.relations[0];
  const categoryNames = unique(input.relations.map((item) => item.categoryName).filter(Boolean));
  const introSentences = splitSentences(input.intro);
  const businessSentences = splitSentences(input.mainBusiness);
  const advantages = unique(
    [...introSentences, ...businessSentences].filter((sentence) => /领先|优势|技术|客户|全球|先进|核心|平台|产能|龙头|壁垒|一站式|专业|综合|提供商/.test(sentence)),
  ).slice(0, 4);

  return {
    stockCode: input.stockCode,
    summary: firstNonEmpty(introSentences[0], `${input.shortName}结构化资料待补。`),
    businessLines,
    chainPosition: unique([
      input.industry ? `所属行业：${input.industry}` : "",
      categoryNames.length > 0 ? `当前细分：${categoryNames.slice(0, 4).join(" / ")}` : "",
      relation ? `关系判断：${relation.relationType} · ${relation.confidence}` : "",
    ]),
    competitiveAdvantages: advantages.length > 0 ? advantages : ["待补：技术壁垒、客户结构、产能规模、成本优势"],
    keyCustomers: ["客户待补"],
    catalysts: ["业务收入占比、毛利率与订单变化待跟踪"],
    risks: ["行业周期、价格波动与客户集中度风险待评估"],
    sourceSummary: input.evidenceTitles[0] ?? `自动结构化：${input.shortName}`,
  };
}

export function buildDisplayResearchProfile(input: DisplayResearchProfileInput): CompanyResearchProfile {
  const draft = buildResearchProfileDraft({
    stockCode: input.company.stockCode,
    shortName: input.company.shortName,
    industry: input.company.industry,
    intro: input.company.intro,
    mainBusiness: input.company.mainBusiness,
    relations: input.relations,
    evidenceTitles: input.evidenceTitles,
  });
  const customerHints = extractCustomerHints([input.company.intro, input.company.mainBusiness, ...input.relations.map((relation) => relation.rationale)]);
  const fallbackKeyCustomers = customerHints.length > 0 ? customerHints : draft.keyCustomers;

  if (!input.existingProfile) {
    return withTimestamps({ ...draft, keyCustomers: fallbackKeyCustomers }, input.company.updatedAt);
  }

  return {
    ...input.existingProfile,
    summary: input.existingProfile.summary || draft.summary,
    businessLines: input.existingProfile.businessLines.length > 0 ? input.existingProfile.businessLines : draft.businessLines,
    chainPosition: input.existingProfile.chainPosition.length > 0 ? input.existingProfile.chainPosition : draft.chainPosition,
    competitiveAdvantages:
      input.existingProfile.competitiveAdvantages.length > 0 ? input.existingProfile.competitiveAdvantages : draft.competitiveAdvantages,
    keyCustomers: hasOnlyPlaceholder(input.existingProfile.keyCustomers, "客户待补") ? fallbackKeyCustomers : input.existingProfile.keyCustomers,
    catalysts: input.existingProfile.catalysts.length > 0 ? input.existingProfile.catalysts : draft.catalysts,
    risks: input.existingProfile.risks.length > 0 ? input.existingProfile.risks : draft.risks,
    sourceSummary: input.existingProfile.sourceSummary || draft.sourceSummary,
  };
}

function extractBusinessLines(mainBusiness: string, industry: string) {
  const percentageLines = Array.from(mainBusiness.matchAll(/([^；;。,\n，]{2,28}?)(?:收入|营收|业务)?(?:占比|比重|比例)?\s*[:：]?\s*(\d+(?:\.\d+)?%)/g))
    .map((match) => ({
      name: cleanLine(match[1]),
      share: match[2],
      grossMargin: "毛利率待补",
    }))
    .filter((line) => line.name);
  if (percentageLines.length > 0) return percentageLines.slice(0, 6);

  const productSection = findLabeledSection(mainBusiness, ["主营构成", "主营产品", "主要产品", "核心业务"]);
  const candidateText =
    productSection ||
    (mainBusiness
      .replace(/^(东财行业|相关概念|主营业务|核心业务|业务|主营构成)[:：]/, "")
      .split(/[；;。]/)
      .find((section) => section.trim() && !/^经营评述[:：]/.test(section.trim())) ??
      "");
  const candidates = unique(
    candidateText
      .split(/[、，,]/)
      .map(cleanLine)
      .filter((line) => line && !/^相关概念/.test(line) && !/^东财行业/.test(line)),
  ).slice(0, 6);

  if (candidates.length > 0) {
    return candidates.map((name) => ({ name, share: "占比待补", grossMargin: "毛利率待补" }));
  }

  return [{ name: industry ? `${industry}相关业务` : "核心业务待补", share: "占比待补", grossMargin: "毛利率待补" }];
}

function findLabeledSection(value: string, labels: string[]) {
  for (const label of labels) {
    const match = value.match(new RegExp(`${label}[:：]([^；;。\\n]+)`));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function extractCustomerHints(values: string[]) {
  const hints = unique(
    values
      .flatMap((value) => splitSentences(value))
      .filter((sentence) => /客户|下游|供应|应用于|配套/.test(sentence))
      .map((sentence) => {
        const match = sentence.match(/(?:为|向|面向|应用于)([^。；;，,]{2,40}客户)/);
        const explicitCustomer = match?.[1]?.trim() ?? "";
        if (explicitCustomer && explicitCustomer !== "客户" && !/^客户/.test(explicitCustomer)) return explicitCustomer;
        return "";
      })
      .filter(Boolean),
  );
  return hints.slice(0, 4);
}

function hasOnlyPlaceholder(values: string[], placeholder: string) {
  return values.length === 0 || values.every((value) => value.trim() === placeholder || value.includes("待补"));
}

function withTimestamps(profile: CompanyResearchProfileInput, timestamp: string): CompanyResearchProfile {
  return {
    ...profile,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function splitSentences(value: string) {
  return value
    .split(/[。；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function cleanLine(value: string) {
  return value
    .replace(/^(其中|包括|主要包括|主营|业务|和|及)/, "")
    .replace(/(?:收入|营收)?(?:占比|比重|比例)?[:：]?$/g, "")
    .trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim()) ?? "";
}
