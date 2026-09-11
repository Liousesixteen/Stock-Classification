import { describe, expect, it } from "vitest";
import { normalizeFinSightMarkdown } from "@/lib/finsight/runtime";

describe("embedded report bridge runtime", () => {
  it("normalizes upstream numeric citations into durable report citation ids", () => {
    const result = normalizeFinSightMarkdown([
      "# 示例研报",
      "",
      "## 投资摘要",
      "",
      "公司收入增长 [1, 2]。",
      "",
      "## Reference Data Sources",
      "",
      "1. 公司 2025 年年度报告 https://example.com/annual.pdf",
      "2. 国家统计局行业数据 2026-03-01 https://example.com/statistics",
    ].join("\n"));

    expect(result.markdown).toContain("[atlas-research:1] [atlas-research:2]");
    expect(result.citations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "atlas-research:1", sourceType: "公司公告/财报" }),
      expect.objectContaining({ id: "atlas-research:2", sourceType: "政策/官方统计", sourceDate: "2026-03-01" }),
    ]));
  });

  it("does not rewrite numeric brackets without a matching reference entry", () => {
    const result = normalizeFinSightMarkdown("# 报告\n\n样本数量为 [2025]。\n\n## Reference Data Sources\n\n1. 示例来源");
    expect(result.markdown).toContain("[2025]");
    expect(result.markdown).not.toContain("[atlas-research:2025]");
  });

  it("removes implementation provenance from generated answers and citation ids", () => {
    const result = normalizeFinSightMarkdown("# FinSight 报告\n\n由 FINSIGHT 生成 [finsight:1]。\n\n## 参考资料\n\n1. FinSight 数据源");

    expect(result.markdown.toLowerCase()).not.toContain("finsight");
    expect(JSON.stringify(result.citations).toLowerCase()).not.toContain("finsight");
    expect(result.markdown).toContain("星图研报引擎");
    expect(result.markdown).toContain("[atlas-research:1]");
  });
});
