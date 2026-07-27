import type {
  CONFIDENCE_LEVELS,
  GRAPH_ENTITY_RELATION_TYPES,
  GRAPH_ENTITY_TYPES,
  GRAPH_RELATION_DIRECTIONS,
  NOTE_TYPES,
  RELATION_TYPES,
  SOURCE_TYPES,
} from "./constants";
import type { EvidenceVerificationStatus } from "@/lib/research/evidenceTrust";

export type RelationType = (typeof RELATION_TYPES)[number];
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type NoteType = (typeof NOTE_TYPES)[number];
export type GraphEntityType = (typeof GRAPH_ENTITY_TYPES)[number];
export type GraphEntityRelationType = (typeof GRAPH_ENTITY_RELATION_TYPES)[number];
export type GraphRelationDirection = (typeof GRAPH_RELATION_DIRECTIONS)[number];

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
  direction: GraphRelationDirection;
  strength: number;
  observedAt: string;
  verificationStatus?: "unverified" | "verified";
  verifiedAt?: string;
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
  verificationStatus: EvidenceVerificationStatus;
  verifiedAt: string;
};

export type ResearchNote = {
  id: number;
  targetType: "company" | "category" | "relation";
  targetId: string;
  noteType: NoteType;
  content: string;
  tags: string[];
};
