import type { CONFIDENCE_LEVELS, NOTE_TYPES, RELATION_TYPES, SOURCE_TYPES } from "./constants";

export type RelationType = (typeof RELATION_TYPES)[number];
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type NoteType = (typeof NOTE_TYPES)[number];

export type CategoryNode = {
  id: number;
  name: string;
  parentId: number | null;
  level: number;
  sortOrder: number;
  aliases: string[];
  description: string;
  industry: string;
  isActive: boolean;
  children: CategoryNode[];
};

export type Company = {
  stockCode: string;
  shortName: string;
  fullName: string;
  board: string;
  industry: string;
  region: string;
  marketCapBand: string;
  intro: string;
  mainBusiness: string;
  updatedAt: string;
};

export type CompanyRelation = {
  id: number;
  stockCode: string;
  categoryId: number;
  relationType: RelationType;
  confidence: ConfidenceLevel;
  rationale: string;
  primaryEvidenceId: number | null;
  isWatchlist: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Evidence = {
  id: number;
  relationId: number;
  sourceType: SourceType;
  title: string;
  sourceDate: string;
  url: string;
  excerpt: string;
  credibility: ConfidenceLevel;
  isExpired: boolean;
};

export type ResearchNote = {
  id: number;
  targetType: "company" | "category" | "relation";
  targetId: string;
  noteType: NoteType;
  content: string;
  tags: string[];
};
