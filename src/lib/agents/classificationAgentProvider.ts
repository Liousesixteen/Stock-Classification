import type { ClassificationAgentInput, ClassificationAgentResult } from "./classificationAgent";
import { organizeStockFacts } from "./classificationAgent";
import { organizeStockFactsWithDeepSeek } from "./deepseekClassificationAgent";

export async function organizeStockFactsWithConfiguredAgent(input: ClassificationAgentInput): Promise<ClassificationAgentResult> {
  const provider = (process.env.CLASSIFICATION_AGENT_PROVIDER ?? "rules").trim().toLowerCase();
  if (provider !== "deepseek") {
    return organizeStockFacts(input);
  }

  try {
    return await organizeStockFactsWithDeepSeek(input);
  } catch {
    return organizeStockFacts(input);
  }
}
