import type { ResearchReportType } from "@/lib/repositories/researchDocuments";

export type ReportGenerationPhase =
  | "preparing"
  | "outline"
  | "evidence"
  | "analysis"
  | "drafting"
  | "quality"
  | "rendering"
  | "complete";

export type ReportGenerationProgress = {
  phase: ReportGenerationPhase;
  step: number;
  totalSteps: number;
  message: string;
  detail?: string;
  reportType?: ResearchReportType;
  sectionTitle?: string;
  completedSections?: number;
  totalSections?: number;
  citationCount?: number;
  createdAt: string;
};

export function createReportProgress(
  event: Omit<ReportGenerationProgress, "createdAt" | "totalSteps"> & { totalSteps?: number },
): ReportGenerationProgress {
  return {
    ...event,
    totalSteps: event.totalSteps ?? 7,
    createdAt: new Date().toISOString(),
  };
}
