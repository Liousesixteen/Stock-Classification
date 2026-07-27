import { getDatabase } from "@/lib/db/client";
import { createWorkspaceExport } from "@/lib/export/workspace";
import { withApiObservability } from "@/lib/operations/observability";

export const dynamic = "force-dynamic";

function exportWorkspace(request: Request) {
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(createWorkspaceExport(getDatabase(), format), {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="stock-classification-${stamp}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withApiObservability("workspace.export", exportWorkspace, { audit: true });
