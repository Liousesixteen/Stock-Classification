import type {
  ConfidenceLevel,
  GraphEntityRelationType,
  GraphEntityType,
  GraphRelationDirection,
  RelationType,
} from "@/lib/domain/types";
import type { EvidenceVerificationStatus } from "@/lib/research/evidenceTrust";

export type IndustryGraphSignalFilter =
  | "all"
  | "verified"
  | "review"
  | "missingEvidence"
  | "watchlist"
  | "upstream"
  | "downstream";

export type IndustryGraphDisplaySettings = {
  showCompanies: boolean;
  showCategories: boolean;
  showLinks: boolean;
  showEvidenceHeat: boolean;
};

export type IndustryGraphRelationRow = {
  relationId?: number;
  categoryId: number;
  stockCode: string;
  shortName: string;
  board?: string;
  industry?: string;
  intro?: string;
  mainBusiness?: string;
  relationType: RelationType;
  confidence: ConfidenceLevel;
  rationale?: string;
  isWatchlist?: boolean;
  evidenceCount: number;
  evidencePreviews?: IndustryGraphEvidencePreview[];
  direction?: GraphRelationDirection;
  strength?: number;
  observedAt?: string;
  verificationStatus?: "unverified" | "verified";
};

export type IndustryGraphEvidencePreview = {
  id: number;
  sourceType: string;
  title: string;
  credibility: ConfidenceLevel;
  sourceDate: string;
  url?: string;
  excerpt?: string;
  verificationStatus?: EvidenceVerificationStatus;
  verifiedAt?: string;
  isExpired?: boolean;
};

export type IndustryGraphEntityRelationRow = {
  relationId: number;
  stockCode: string;
  entityId: number;
  entityType: GraphEntityType;
  entityName: string;
  entitySummary: string;
  relationType: GraphEntityRelationType;
  confidence: ConfidenceLevel;
  rationale: string;
  isWatchlist: boolean;
  evidenceCount: number;
  evidencePreviews: IndustryGraphEvidencePreview[];
  direction?: GraphRelationDirection;
  strength?: number;
  observedAt?: string;
  verificationStatus?: "unverified" | "verified";
  shortName?: string;
  board?: string;
  industry?: string;
  intro?: string;
  mainBusiness?: string;
};

export type IndustryGraphNode =
  | {
      id: string;
      kind: "category";
      label: string;
      categoryId: number;
      parentId: number | null;
      level: number;
      layoutSeed: number;
    }
  | {
      id: string;
      kind: "entity";
      label: string;
      entityId: number;
      entityType: GraphEntityType;
      summary: string;
      evidenceCount: number;
      layoutSeed: number;
    }
  | {
      id: string;
      kind: "company";
      label: string;
      stockCode: string;
      board?: string;
      industry?: string;
      summary?: string;
      mainBusiness?: string;
      relationType: RelationType;
      confidence: ConfidenceLevel;
      evidenceCount: number;
      layoutSeed: number;
    }
  | {
      id: string;
      kind: "evidence";
      label: string;
      evidenceId: number;
      evidenceScope: "category" | "entity";
      ownerNodeId: string;
      relationId?: number;
      sourceType: string;
      sourceDate: string;
      credibility: ConfidenceLevel;
      url: string;
      excerpt: string;
      verificationStatus: EvidenceVerificationStatus;
      layoutSeed: number;
    };

export type IndustryGraphEdge =
  | {
      id: string;
      source: string;
      target: string;
      kind: "hierarchy";
      relationType?: never;
      confidence?: never;
      evidenceCount: number;
    }
  | {
      id: string;
      source: string;
      target: string;
      kind: "relation";
      relationId?: number;
      relationType: RelationType;
      confidence: ConfidenceLevel;
      evidenceCount: number;
      rationale?: string;
      isWatchlist?: boolean;
      evidencePreviews?: IndustryGraphEvidencePreview[];
      direction?: GraphRelationDirection;
      strength?: number;
      observedAt?: string;
      verificationStatus?: "unverified" | "verified";
    }
  | {
      id: string;
      source: string;
      target: string;
      kind: "entityRelation";
      relationId: number;
      relationType: GraphEntityRelationType;
      confidence: ConfidenceLevel;
      evidenceCount: number;
      rationale: string;
      isWatchlist: boolean;
      evidencePreviews: IndustryGraphEvidencePreview[];
      direction?: GraphRelationDirection;
      strength?: number;
      observedAt?: string;
      verificationStatus?: "unverified" | "verified";
    }
  | {
      id: string;
      source: string;
      target: string;
      kind: "evidenceLink";
      relationId?: number;
      confidence: ConfidenceLevel;
      evidenceCount: 1;
      direction: "outbound";
      strength: number;
      observedAt: string;
    };

export type IndustryGraphPayload = {
  nodes: IndustryGraphNode[];
  edges: IndustryGraphEdge[];
  stats: {
    categoryCount: number;
    companyCount: number;
    evidenceCount: number;
    verifiedRelationCount?: number;
    unverifiedRelationCount?: number;
    watchlistCount?: number;
    entityCount?: number;
    evidenceNodeCount?: number;
  };
};
