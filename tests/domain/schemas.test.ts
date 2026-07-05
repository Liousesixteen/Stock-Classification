import { describe, expect, it } from "vitest";
import { relationInputSchema } from "@/lib/domain/schemas";

describe("domain schemas", () => {
  it("accepts a valid company-category relation", () => {
    const result = relationInputSchema.parse({
      stockCode: "300346",
      categoryId: 12,
      relationType: "主营业务",
      confidence: "高",
      rationale: "ArF 光刻胶产业化进展明确",
      isWatchlist: false,
    });

    expect(result.stockCode).toBe("300346");
    expect(result.relationType).toBe("主营业务");
  });

  it("rejects an unsupported relation type", () => {
    expect(() =>
      relationInputSchema.parse({
        stockCode: "300346",
        categoryId: 12,
        relationType: "随便写",
        confidence: "高",
        rationale: "bad",
        isWatchlist: false,
      }),
    ).toThrow();
  });
});
