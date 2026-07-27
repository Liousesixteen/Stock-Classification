import { z } from "zod";
import {
  CONFIDENCE_LEVELS,
  GRAPH_ENTITY_RELATION_TYPES,
  GRAPH_ENTITY_TYPES,
  GRAPH_RELATION_DIRECTIONS,
  RELATION_TYPES,
  SOURCE_TYPES,
} from "./constants";

const graphRelationMetadataSchema = {
  direction: z.enum(GRAPH_RELATION_DIRECTIONS).default("undirected"),
  strength: z.number().int().min(0).max(100).default(50),
  observedAt: z.string().trim().default(""),
};

export const stockCodeSchema = z.string().regex(/^(00|30|60|68|83|87|92)\d{4}$/, "股票代码必须是 A 股 6 位代码");
export const sourceUrlSchema = z.string().trim().max(2_000, "来源链接最多 2000 个字符").refine(
  (value) => !value || /^https?:\/\//i.test(value),
  "来源链接必须使用 http 或 https",
);

export const relationInputSchema = z.object({
  stockCode: stockCodeSchema,
  categoryId: z.number().int().positive(),
  relationType: z.enum(RELATION_TYPES),
  confidence: z.enum(CONFIDENCE_LEVELS),
  rationale: z.string().trim().min(1).max(2_000),
  isWatchlist: z.boolean().default(false),
  ...graphRelationMetadataSchema,
});

export const evidenceInputSchema = z.object({
  relationId: z.number().int().positive(),
  sourceType: z.enum(SOURCE_TYPES),
  title: z.string().trim().min(1).max(500),
  sourceDate: z.string().trim().max(40).default(""),
  url: sourceUrlSchema.default(""),
  excerpt: z.string().trim().max(5_000).default(""),
  credibility: z.enum(CONFIDENCE_LEVELS).default("中"),
  isExpired: z.boolean().default(false),
});

export const relationEvidenceInputSchema = evidenceInputSchema
  .omit({ relationId: true })
  .extend({
    sourceType: z.enum(SOURCE_TYPES).default("网页"),
    title: z.string().trim().max(500).default(""),
    credibility: z.enum(CONFIDENCE_LEVELS).optional(),
  })
  .refine((evidence) => evidence.title || evidence.excerpt || evidence.url, "证据标题、摘录或链接至少填写一项");

export const categoryNameSchema = z.string().trim().min(1, "分类名称不能为空").max(80, "分类名称最多 80 个字符");

export const categoryCreateInputSchema = z.object({
  name: categoryNameSchema,
  parentId: z.number().int().positive().nullable().optional(),
});

export const categoryRenameInputSchema = z.object({
  name: categoryNameSchema,
});

export const companyProfileInputSchema = z.object({
  shortName: z.string().trim().min(1, "公司简称不能为空").max(80),
  fullName: z.string().trim().max(200).default(""),
  board: z.string().trim().max(40).default(""),
  industry: z.string().trim().max(120).default(""),
  region: z.string().trim().max(80).default(""),
  marketCapBand: z.string().trim().max(80).default(""),
  intro: z.string().trim().max(5_000).default(""),
  mainBusiness: z.string().trim().max(10_000).default(""),
});

export const companyResearchBusinessLineSchema = z.object({
  name: z.string().trim().min(1, "业务名称不能为空").max(200),
  share: z.string().trim().max(100).default("占比待补"),
  grossMargin: z.string().trim().max(100).default("毛利率待补"),
});

export const companyResearchProfileInputSchema = z.object({
  summary: z.string().trim().max(5_000).default(""),
  businessLines: z.array(companyResearchBusinessLineSchema).max(100).default([]),
  chainPosition: z.array(z.string().trim().max(1_000)).max(100).default([]),
  competitiveAdvantages: z.array(z.string().trim().max(2_000)).max(100).default([]),
  keyCustomers: z.array(z.string().trim().max(1_000)).max(100).default([]),
  catalysts: z.array(z.string().trim().max(2_000)).max(100).default([]),
  risks: z.array(z.string().trim().max(2_000)).max(100).default([]),
  sourceSummary: z.string().trim().max(5_000).default(""),
});

export const companyNoteInputSchema = z.object({
  content: z.string().trim().max(5000, "备注最多 5000 个字符").default(""),
});

export const companyGraphEntityRelationInputSchema = z.object({
  entityType: z.enum(GRAPH_ENTITY_TYPES),
  entityName: z.string().trim().min(1, "实体名称不能为空").max(120, "实体名称最多 120 个字符"),
  entitySummary: z.string().trim().max(1200, "实体说明最多 1200 个字符").default(""),
  relationType: z.enum(GRAPH_ENTITY_RELATION_TYPES),
  confidence: z.enum(CONFIDENCE_LEVELS).default("中"),
  rationale: z.string().trim().min(1, "关系说明不能为空").max(2000, "关系说明最多 2000 个字符"),
  isWatchlist: z.boolean().default(false),
  ...graphRelationMetadataSchema,
  evidence: relationEvidenceInputSchema,
});

export const manualStockRelationInputSchema = companyProfileInputSchema.extend({
  stockCode: stockCodeSchema,
  categoryId: z.number().int().positive(),
  relationType: z.enum(RELATION_TYPES).default("主营业务"),
  confidence: z.enum(CONFIDENCE_LEVELS).default("中"),
  rationale: z.string().trim().min(1, "归类说明不能为空").max(2_000),
  isWatchlist: z.boolean().default(false),
  ...graphRelationMetadataSchema,
  evidence: relationEvidenceInputSchema.optional(),
  researchProfilePatch: companyResearchProfileInputSchema.optional(),
});
