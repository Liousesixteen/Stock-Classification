import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { getCategoryTree, findCategoryByPath } from "@/lib/repositories/categories";
import { upsertCompany } from "@/lib/repositories/companies";
import { upsertRelation, listRelationsForCategory } from "@/lib/repositories/relations";

describe("workbench repositories", () => {
  it("returns category tree and relations for a selected category", () => {
    const db = new Database(":memory:");
    migrate(db);
    seedSemiconductorData(db);

    const category = findCategoryByPath(db, ["半导体", "材料", "光刻材料", "光刻胶", "ArF 干法/浸没式光刻胶"]);
    expect(category?.name).toBe("ArF 干法/浸没式光刻胶");

    upsertCompany(db, {
      stockCode: "300655",
      shortName: "晶瑞电材",
      fullName: "",
      board: "创业板",
      industry: "电子材料",
      region: "",
      marketCapBand: "",
      intro: "示例简介",
      mainBusiness: "光刻胶及配套电子化学品",
      updatedAt: "",
    });

    upsertRelation(db, {
      stockCode: "300655",
      categoryId: category!.id,
      relationType: "主营业务",
      confidence: "高",
      rationale: "光刻胶及配套电子化学品",
      isWatchlist: false,
    });

    const tree = getCategoryTree(db);
    const rows = listRelationsForCategory(db, category!.id);

    expect(tree[0].name).toBe("半导体");
    expect(rows[0].shortName).toBe("晶瑞电材");
    expect(rows[0].relationType).toBe("主营业务");
  });
});
