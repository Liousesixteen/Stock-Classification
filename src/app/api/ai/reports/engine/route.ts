import { getFinSightRuntimeStatus } from "@/lib/finsight/runtime";
import { withApiObservability } from "@/lib/operations/observability";

export const dynamic = "force-dynamic";

async function reportEngineStatus() {
  const finsight = await getFinSightRuntimeStatus();
  return Response.json({
    defaultEngine: (process.env.REPORT_ENGINE_MODE || process.env.FINSIGHT_REPORT_ENGINE) === "finsight" ? "finsight" : "native",
    engines: {
      native: { available: true, label: "证据约束引擎" },
      finsight: {
        available: finsight.available,
        label: "星图多智能体研报引擎",
        chartsEnabled: finsight.chartsEnabled,
        missing: finsight.missing,
      },
    },
  });
}

export const GET = withApiObservability("ai.report.engine.status", reportEngineStatus);
