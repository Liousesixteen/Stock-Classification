import { createResearchDocumentExport, type ResearchDocumentExportFormat } from "@/lib/export/researchDocument";
import { getDatabase } from "@/lib/db/client";
import { getResearchDocument } from "@/lib/repositories/researchDocuments";
import { withApiObservability } from "@/lib/operations/observability";

export const dynamic = "force-dynamic";

async function exportReport(request: Request) {
  const params = new URL(request.url).searchParams;
  const reportId = Number(params.get("id"));
  const requestedFormat = params.get("format");
  const format: ResearchDocumentExportFormat = requestedFormat === "docx" || requestedFormat === "pdf" ? requestedFormat : "markdown";
  if (!Number.isInteger(reportId) || reportId < 1) return Response.json({ error: "报告编号无效" }, { status: 400 });
  const report = getResearchDocument(getDatabase(), reportId);
  if (!report) return Response.json({ error: "研究报告不存在" }, { status: 404 });
  const content = await createResearchDocumentExport(report, format);
  const extension = format === "markdown" ? "md" : format;
  const contentType = format === "docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : format === "pdf"
      ? "application/pdf"
      : "text/markdown; charset=utf-8";
  const body = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeFilename(report.title)}.${extension}`)}`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withApiObservability("ai.report.export", exportReport, { audit: true });

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 90) || "research-report";
}
