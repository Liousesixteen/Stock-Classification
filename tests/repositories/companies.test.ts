import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import {
  findStoredCompanyMention,
  findStoredCompanyQuery,
  upsertCompany,
} from "@/lib/repositories/companies";

describe("stored company recognition", () => {
  it("finds a company inside unrestricted natural-language financial questions", () => {
    const db = new Database(":memory:");
    migrate(db);
    upsertCompany(db, {
      stockCode: "600584",
      shortName: "长电科技",
      fullName: "江苏长电科技股份有限公司",
      board: "沪市主板",
      industry: "半导体",
      region: "江苏",
      marketCapBand: "",
      intro: "",
      mainBusiness: "",
      updatedAt: "",
    });

    expect(findStoredCompanyMention(db, "分析长电科技当前基本面、股价趋势和主要风险")).toMatchObject({
      stockCode: "600584",
      shortName: "长电科技",
    });
    expect(findStoredCompanyQuery(db, "600584")?.shortName).toBe("长电科技");
    expect(findStoredCompanyQuery(db, "长电科技")?.stockCode).toBe("600584");
  });
});
