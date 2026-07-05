import { z } from "zod";
import { CONFIDENCE_LEVELS, RELATION_TYPES, SOURCE_TYPES } from "./constants";

export const stockCodeSchema = z.string().regex(/^(00|30|60|68|83|87)\d{4}$/, "股票代码必须是 A 股 6 位代码");

export const relationInputSchema = z.object({
  stockCode: stockCodeSchema,
  categoryId: z.number().int().positive(),
  relationType: z.enum(RELATION_TYPES),
  confidence: z.enum(CONFIDENCE_LEVELS),
  rationale: z.string().trim().min(1),
  isWatchlist: z.boolean().default(false),
});

export const evidenceInputSchema = z.object({
  relationId: z.number().int().positive(),
  sourceType: z.enum(SOURCE_TYPES),
  title: z.string().trim().min(1),
  sourceDate: z.string().trim().default(""),
  url: z.string().trim().default(""),
  excerpt: z.string().trim().default(""),
  credibility: z.enum(CONFIDENCE_LEVELS).default("中"),
  isExpired: z.boolean().default(false),
});
