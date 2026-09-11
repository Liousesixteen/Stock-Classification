import { describe, expect, it } from "vitest";
import { sanitizePublicFacingPayload, sanitizePublicReportText } from "@/lib/research/publicReportBrand";

describe("public report branding guard", () => {
  it("cleans visible text and legacy citation ids", () => {
    const text = sanitizePublicReportText("FinSight 结论 [finsight:12]");
    expect(text).toBe("星图研报引擎 结论 [atlas-research:12]");
    expect(text.toLowerCase()).not.toContain("finsight");
  });

  it("keeps internal engine values and artifact paths intact", () => {
    const result = sanitizePublicFacingPayload({
      engine: "finsight",
      path: "/tmp/finsight-runs/report.md",
      title: "FINSIGHT 研究报告",
      nested: { answerMarkdown: "由 FinSight 生成" },
    });
    expect(result.engine).toBe("finsight");
    expect(result.path).toBe("/tmp/finsight-runs/report.md");
    expect(result.title).toBe("星图研报引擎 研究报告");
    expect(result.nested.answerMarkdown).toBe("由 星图研报引擎 生成");
  });
});
