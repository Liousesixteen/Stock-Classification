import type { ConfidenceLevel, RelationType } from "@/lib/domain/types";

export type IndustryGraphRelationRow = {
  categoryId: number;
  stockCode: string;
  shortName: string;
  relationType: RelationType;
  confidence: ConfidenceLevel;
  evidenceCount: number;
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
      kind: "company";
      label: string;
      stockCode: string;
      relationType: RelationType;
      confidence: ConfidenceLevel;
      evidenceCount: number;
      layoutSeed: number;
    };

export type IndustryGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "hierarchy" | "relation";
  relationType?: RelationType;
  confidence?: ConfidenceLevel;
  evidenceCount: number;
};

export type IndustryGraphPayload = {
  nodes: IndustryGraphNode[];
  edges: IndustryGraphEdge[];
  stats: {
    categoryCount: number;
    companyCount: number;
    evidenceCount: number;
  };
};
