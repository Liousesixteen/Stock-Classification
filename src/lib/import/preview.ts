import type Database from "better-sqlite3";
import { z } from "zod";
import { CONFIDENCE_LEVELS, RELATION_TYPES, SOURCE_TYPES } from "@/lib/domain/constants";
import type { ConfidenceLevel, RelationType, SourceType } from "@/lib/domain/types";
import { sourceUrlSchema, stockCodeSchema } from "@/lib/domain/schemas";
import { findCategoryByPath } from "@/lib/repositories/categories";

export type RawImportRow = Record<string, unknown>;

export type ValidImportRow = {
  stockCode: string;
  shortName: string;
  categoryId: number;
  categoryPath: string[];
  relationType: RelationType;
  confidence: ConfidenceLevel;
  rationale: string;
  sourceType: SourceType;
  sourceTitle: string;
  sourceUrl: string;
  sourceDate: string;
  sourceExcerpt: string;
  intro: string;
  note: string;
};

export const validImportRowSchema = z.object({
  stockCode: stockCodeSchema,
  shortName: z.string().trim().min(1).max(80),
  categoryId: z.number().int().positive(),
  categoryPath: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  relationType: z.enum(RELATION_TYPES),
  confidence: z.enum(CONFIDENCE_LEVELS),
  rationale: z.string().trim().max(2_000),
  sourceType: z.enum(SOURCE_TYPES),
  sourceTitle: z.string().trim().max(500),
  sourceUrl: sourceUrlSchema,
  sourceDate: z.string().trim().max(40),
  sourceExcerpt: z.string().trim().max(5_000),
  intro: z.string().trim().max(5_000),
  note: z.string().trim().max(5_000),
});

export const importCommitSchema = z.object({
  rows: z.array(validImportRowSchema).max(5_000, "单次最多提交 5000 行"),
});

export type ImportPreview = {
  validRows: ValidImportRow[];
  errors: Array<{ rowNumber: number; messages: string[] }>;
  unknownCategories: string[];
  duplicateKeys: string[];
};

const relationTypes = new Set<string>(RELATION_TYPES);
const confidenceLevels = new Set<string>(CONFIDENCE_LEVELS);
const sourceTypes = new Set<string>(SOURCE_TYPES);

function cell(row: RawImportRow, key: string) {
  const value = row[key];
  return value == null ? "" : String(value).trim();
}

function uniquePush(values: string[], value: string) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function splitCategoryPath(rawPath: string) {
  return rawPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveCategoryPath(db: Database.Database, rawPath: string) {
  const parts = splitCategoryPath(rawPath);

  function walk(start: number, path: string[]): { categoryId: number; categoryPath: string[] } | undefined {
    if (start === parts.length) {
      const category = findCategoryByPath(db, path);
      return category ? { categoryId: category.id, categoryPath: path } : undefined;
    }

    for (let end = start + 1; end <= parts.length; end += 1) {
      const candidate = parts.slice(start, end).join("/");
      const nextPath = [...path, candidate];
      const prefix = findCategoryByPath(db, nextPath);

      if (!prefix) {
        continue;
      }

      const resolved = walk(end, nextPath);
      if (resolved) {
        return resolved;
      }
    }

    return undefined;
  }

  return walk(0, []);
}

export function previewImportRows(db: Database.Database, rows: RawImportRow[]): ImportPreview {
  const validRows: ValidImportRow[] = [];
  const errors: ImportPreview["errors"] = [];
  const unknownCategories: string[] = [];
  const duplicateKeys: string[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const messages: string[] = [];
    const stockCode = cell(row, "股票代码");
    const shortName = cell(row, "公司简称");
    const categoryPathText = cell(row, "分类路径");
    const categoryPathParts = splitCategoryPath(categoryPathText);
    const relationType = cell(row, "关系类型");
    const confidence = cell(row, "确信度");
    const sourceTypeText = cell(row, "来源类型") || "其他";

    if (!stockCodeSchema.safeParse(stockCode).success) {
      messages.push("股票代码无效");
    }

    if (!shortName) {
      messages.push("公司简称缺失");
    }

    if (categoryPathParts.length === 0) {
      messages.push("分类路径缺失");
    }

    const resolvedCategory = categoryPathParts.length > 0 ? resolveCategoryPath(db, categoryPathText) : undefined;
    if (categoryPathParts.length > 0 && !resolvedCategory) {
      messages.push("分类路径不存在");
      uniquePush(unknownCategories, categoryPathText);
    }

    if (!relationTypes.has(relationType)) {
      messages.push("关系类型无效");
    }

    if (!confidenceLevels.has(confidence)) {
      messages.push("确信度无效");
    }

    if (!sourceTypes.has(sourceTypeText)) {
      messages.push("来源类型无效");
    }

    const duplicateKey = resolvedCategory ? `${stockCode}:${resolvedCategory.categoryId}` : "";
    if (duplicateKey) {
      if (seenKeys.has(duplicateKey)) {
        messages.push("重复关系");
        uniquePush(duplicateKeys, duplicateKey);
      } else {
        seenKeys.add(duplicateKey);
      }
    }

    if (messages.length > 0) {
      errors.push({ rowNumber, messages });
      return;
    }

    validRows.push({
      stockCode,
      shortName,
      categoryId: resolvedCategory!.categoryId,
      categoryPath: resolvedCategory!.categoryPath,
      relationType: relationType as RelationType,
      confidence: confidence as ConfidenceLevel,
      rationale: cell(row, "判断说明"),
      sourceType: sourceTypeText as SourceType,
      sourceTitle: cell(row, "来源标题"),
      sourceUrl: cell(row, "来源链接"),
      sourceDate: cell(row, "来源日期"),
      sourceExcerpt: cell(row, "来源摘录"),
      intro: cell(row, "公司简介"),
      note: cell(row, "研究备注"),
    });
  });

  return {
    validRows,
    errors,
    unknownCategories,
    duplicateKeys,
  };
}
