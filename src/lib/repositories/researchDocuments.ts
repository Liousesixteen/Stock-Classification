import type Database from "better-sqlite3";
import type { ResearchCitation } from "@/lib/research/researchEvidenceCatalog";
import type { ResearchReportArtifact, ResearchReportEngine } from "@/lib/finsight/runtime";
import { sanitizePublicReportText } from "@/lib/research/publicReportBrand";

export type ResearchReportType = "company" | "industry" | "macro" | "comparison" | "event" | "general";
export type ResearchDocumentStage = "draft" | "ready" | "needs_work";
export type ResearchDocumentVersionSource = "generated" | "edited" | "rewritten" | "restored";

export type ResearchReportQuality = {
  score: number;
  sectionCoverage: number;
  citationCoverage: number;
  evidenceQuality: number;
  riskDisclosure: number;
  unsupportedClaimCount: number;
  issues: string[];
};

export type ResearchReportChart = {
  id: string;
  title: string;
  kind: "bar" | "table";
  unit: string;
  sourceCitationIds: string[];
  rows: Array<{ label: string; value: number | string; secondary?: number | string }>;
};

export type StoredResearchDocument = {
  id: number;
  reportType: ResearchReportType;
  subjectKey: string;
  subjectLabel: string;
  stockCode: string;
  categoryId: number | null;
  comparisonCodes: string[];
  title: string;
  executiveSummary: string;
  markdown: string;
  model: string;
  engine: ResearchReportEngine;
  status: ResearchDocumentStage;
  currentVersion: number;
  citations: ResearchCitation[];
  quality: ResearchReportQuality;
  charts: ResearchReportChart[];
  artifacts: ResearchReportArtifact[];
  createdAt: string;
  updatedAt: string;
};

export type ResearchDocumentVersion = {
  id: number;
  reportId: number;
  versionNumber: number;
  content: string;
  changeSummary: string;
  source: ResearchDocumentVersionSource;
  model: string;
  createdAt: string;
};

type DocumentRow = Omit<StoredResearchDocument, "comparisonCodes" | "markdown" | "citations" | "quality" | "charts" | "artifacts"> & {
  comparisonCodesJson: string;
  content: string;
  citationsJson: string;
  qualityJson: string;
  chartsJson: string;
  artifactsJson: string;
};

type CreateResearchDocumentInput = Omit<StoredResearchDocument, "id" | "currentVersion" | "createdAt" | "updatedAt" | "engine" | "artifacts">
  & Partial<Pick<StoredResearchDocument, "engine" | "artifacts">>;

export function createResearchDocument(
  db: Database.Database,
  input: CreateResearchDocumentInput,
) {
  const publicInput = sanitizeDocumentInput(input);
  const transaction = db.transaction(() => {
    const row = db.prepare(
      `insert into research_documents (
         report_type, subject_key, subject_label, stock_code, category_id, comparison_codes,
         title, executive_summary, content, model, engine, status, current_version,
         citations_json, quality_json, charts_json, artifacts_json
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
       returning id`,
    ).get(
      publicInput.reportType,
      publicInput.subjectKey,
      publicInput.subjectLabel,
      publicInput.stockCode || null,
      publicInput.categoryId,
      JSON.stringify(publicInput.comparisonCodes),
      publicInput.title,
      publicInput.executiveSummary,
      publicInput.markdown,
      publicInput.model,
      publicInput.engine ?? "native",
      publicInput.status,
      JSON.stringify(publicInput.citations),
      JSON.stringify(publicInput.quality),
      JSON.stringify(publicInput.charts),
      JSON.stringify(publicInput.artifacts ?? []),
    ) as { id: number };
    db.prepare(
      `insert into research_document_versions (
         report_id, version_number, content, change_summary, source, model
       ) values (?, 1, ?, '首次生成', 'generated', ?)`,
    ).run(row.id, publicInput.markdown, publicInput.model);
    return row.id;
  });
  return transaction();
}

export function getResearchDocument(db: Database.Database, reportId: number): StoredResearchDocument | null {
  const row = db.prepare(documentSelect("where document.id = ?")).get(reportId) as DocumentRow | undefined;
  return row ? mapDocument(row) : null;
}

export function getLatestResearchDocument(
  db: Database.Database,
  reportType: ResearchReportType,
  subjectKey: string,
): StoredResearchDocument | null {
  const row = db.prepare(documentSelect(
    "where document.report_type = ? and document.subject_key = ? order by document.id desc limit 1",
  )).get(reportType, subjectKey) as DocumentRow | undefined;
  return row ? mapDocument(row) : null;
}

export function listResearchDocuments(db: Database.Database): StoredResearchDocument[] {
  return (db.prepare(documentSelect("order by document.updated_at desc, document.id desc")).all() as DocumentRow[]).map(mapDocument);
}

export function listResearchDocumentVersions(db: Database.Database, reportId: number): ResearchDocumentVersion[] {
  const rows = db.prepare(
    `select id, report_id as reportId, version_number as versionNumber, content,
            change_summary as changeSummary, source, model, created_at as createdAt
     from research_document_versions
     where report_id = ?
     order by version_number desc`,
  ).all(reportId) as ResearchDocumentVersion[];
  return rows.map((row) => ({
    ...row,
    content: sanitizePublicReportText(row.content),
    changeSummary: sanitizePublicReportText(row.changeSummary),
    model: sanitizePublicReportText(row.model),
  }));
}

export function saveResearchDocumentVersion(
  db: Database.Database,
  input: {
    reportId: number;
    content: string;
    changeSummary: string;
    source: ResearchDocumentVersionSource;
    model?: string;
    quality?: ResearchReportQuality;
  },
) {
  return db.transaction(() => {
    const current = getResearchDocument(db, input.reportId);
    if (!current) throw new Error("研究报告不存在");
    const versionNumber = current.currentVersion + 1;
    const model = sanitizePublicReportText(input.model || current.model);
    const quality = sanitizeQuality(input.quality ?? current.quality);
    const content = sanitizePublicReportText(input.content);
    const changeSummary = sanitizePublicReportText(input.changeSummary);
    const status: ResearchDocumentStage = quality.score >= 75 && current.citations.length > 0 ? "ready" : "needs_work";
    db.prepare(
      `insert into research_document_versions (
         report_id, version_number, content, change_summary, source, model
       ) values (?, ?, ?, ?, ?, ?)`,
    ).run(input.reportId, versionNumber, content, changeSummary, input.source, model);
    db.prepare(
      `update research_documents
       set content = ?, current_version = ?, model = ?, status = ?, quality_json = ?, artifacts_json = '[]', updated_at = current_timestamp
       where id = ?`,
    ).run(content, versionNumber, model, status, JSON.stringify(quality), input.reportId);
    return versionNumber;
  })();
}

function documentSelect(suffix: string) {
  return `select document.id, document.report_type as reportType, document.subject_key as subjectKey,
                 document.subject_label as subjectLabel, coalesce(document.stock_code, '') as stockCode,
                 document.category_id as categoryId, document.comparison_codes as comparisonCodesJson,
                 document.title, document.executive_summary as executiveSummary, document.content,
                 document.model, document.engine, document.status, document.current_version as currentVersion,
                 document.citations_json as citationsJson, document.quality_json as qualityJson,
                 document.charts_json as chartsJson, document.artifacts_json as artifactsJson,
                 document.created_at as createdAt,
                 document.updated_at as updatedAt
          from research_documents document ${suffix}`;
}

function mapDocument(row: DocumentRow): StoredResearchDocument {
  return {
    ...row,
    subjectLabel: sanitizePublicReportText(row.subjectLabel),
    title: sanitizePublicReportText(row.title),
    executiveSummary: sanitizePublicReportText(row.executiveSummary),
    model: sanitizePublicReportText(row.model),
    comparisonCodes: parseJson<string[]>(row.comparisonCodesJson, []),
    markdown: sanitizePublicReportText(row.content),
    citations: parseJson<ResearchCitation[]>(row.citationsJson, []).map(sanitizeCitation),
    quality: sanitizeQuality(parseJson<ResearchReportQuality>(row.qualityJson, emptyQuality())),
    charts: parseJson<ResearchReportChart[]>(row.chartsJson, []).map(sanitizeChart),
    artifacts: parseJson<ResearchReportArtifact[]>(row.artifactsJson, []),
  };
}

function sanitizeDocumentInput(input: CreateResearchDocumentInput): CreateResearchDocumentInput {
  return {
    ...input,
    subjectLabel: sanitizePublicReportText(input.subjectLabel),
    title: sanitizePublicReportText(input.title),
    executiveSummary: sanitizePublicReportText(input.executiveSummary),
    markdown: sanitizePublicReportText(input.markdown),
    model: sanitizePublicReportText(input.model),
    citations: input.citations.map(sanitizeCitation),
    quality: sanitizeQuality(input.quality),
    charts: input.charts.map(sanitizeChart),
  };
}

function sanitizeCitation(citation: ResearchCitation): ResearchCitation {
  return {
    ...citation,
    id: sanitizePublicReportText(citation.id),
    title: sanitizePublicReportText(citation.title),
    sourceType: sanitizePublicReportText(citation.sourceType),
    excerpt: sanitizePublicReportText(citation.excerpt),
  };
}

function sanitizeQuality(quality: ResearchReportQuality): ResearchReportQuality {
  return { ...quality, issues: quality.issues.map(sanitizePublicReportText) };
}

function sanitizeChart(chart: ResearchReportChart): ResearchReportChart {
  return {
    ...chart,
    title: sanitizePublicReportText(chart.title),
    unit: sanitizePublicReportText(chart.unit),
    sourceCitationIds: chart.sourceCitationIds.map(sanitizePublicReportText),
    rows: chart.rows.map((row) => ({
      ...row,
      label: sanitizePublicReportText(row.label),
      value: typeof row.value === "string" ? sanitizePublicReportText(row.value) : row.value,
      secondary: typeof row.secondary === "string" ? sanitizePublicReportText(row.secondary) : row.secondary,
    })),
  };
}

export function emptyQuality(): ResearchReportQuality {
  return {
    score: 0,
    sectionCoverage: 0,
    citationCoverage: 0,
    evidenceQuality: 0,
    riskDisclosure: 0,
    unsupportedClaimCount: 0,
    issues: [],
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
