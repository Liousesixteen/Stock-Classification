import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import {
  createCategory,
  deleteCategoryBranch,
  findCategoryByPath,
  getCategoryTree,
  renameCategory,
} from "@/lib/repositories/categories";
import { addEvidenceToRelation, createEvidence, listEvidenceForRelation } from "@/lib/repositories/evidence";
import { getCompany, updateCompanyProfile, upsertCompany } from "@/lib/repositories/companies";
import {
  deleteRelation,
  listRelationsForCategory,
  listRelationsForCompany,
  setPrimaryEvidenceForRelation,
  upsertRelation,
} from "@/lib/repositories/relations";

function setupDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedSemiconductorData(db);
  return db;
}

function upsertTestCompany(db: Database.Database, stockCode: string, shortName: string) {
  upsertCompany(db, {
    stockCode,
    shortName,
    fullName: "",
    board: "创业板",
    industry: "电子材料",
    region: "",
    marketCapBand: "",
    intro: `${shortName} 简介`,
    mainBusiness: `${shortName} 主营业务`,
    updatedAt: "",
  });
}

describe("workbench repositories", () => {
  it("returns category tree and relations for a selected category", () => {
    const db = setupDb();

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

  it("resolves root paths and returns undefined for missing category paths", () => {
    const db = setupDb();

    expect(findCategoryByPath(db, ["半导体"])?.parentId).toBeNull();
    expect(findCategoryByPath(db, ["半导体", "不存在"])).toBeUndefined();
  });

  it("seeds requested theme boards with representative stock relations", () => {
    const db = setupDb();
    const expected = [
      ["创新药", "688235", "百济神州"],
      ["机器人", "300124", "汇川技术"],
      ["商业航天", "601698", "中国卫通"],
      ["证券", "600030", "中信证券"],
    ] as const;

    for (const [categoryName, stockCode, shortName] of expected) {
      const category = findCategoryByPath(db, [categoryName]);
      const rows = category ? listRelationsForCategory(db, category.id) : [];

      expect(category?.name).toBe(categoryName);
      expect(rows.some((row) => row.stockCode === stockCode && row.shortName === shortName)).toBe(true);
      expect(rows.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("preserves existing company intro and main business when upsert values are empty", () => {
    const db = setupDb();

    upsertTestCompany(db, "300655", "晶瑞电材");
    upsertCompany(db, {
      stockCode: "300655",
      shortName: "晶瑞电材更新",
      fullName: "",
      board: "创业板",
      industry: "电子材料",
      region: "",
      marketCapBand: "",
      intro: "",
      mainBusiness: "",
      updatedAt: "",
    });

    const company = getCompany(db, "300655");

    expect(company?.shortName).toBe("晶瑞电材更新");
    expect(company?.intro).toBe("晶瑞电材 简介");
    expect(company?.mainBusiness).toBe("晶瑞电材 主营业务");
  });

  it("updates relations in place and maps watchlist consistently", () => {
    const db = setupDb();
    const category = findCategoryByPath(db, ["半导体", "材料", "光刻材料", "光刻胶", "ArF 干法/浸没式光刻胶"]);
    upsertTestCompany(db, "300655", "晶瑞电材");

    const firstId = upsertRelation(db, {
      stockCode: "300655",
      categoryId: category!.id,
      relationType: "待验证",
      confidence: "低",
      rationale: "初始判断",
      isWatchlist: false,
      direction: "outbound",
      strength: 82,
      observedAt: "2026-07-20",
    });
    const secondId = upsertRelation(db, {
      stockCode: "300655",
      categoryId: category!.id,
      relationType: "重要相关",
      confidence: "高",
      rationale: "更新判断",
      isWatchlist: true,
    });

    const [categoryRow] = listRelationsForCategory(db, category!.id);
    const [companyRow] = listRelationsForCompany(db, "300655");

    expect(secondId).toBe(firstId);
    expect(categoryRow).toMatchObject({
      id: firstId,
      relationType: "重要相关",
      confidence: "高",
      rationale: "更新判断",
      isWatchlist: true,
      direction: "outbound",
      strength: 82,
      observedAt: "2026-07-20",
    });
    expect(companyRow).toMatchObject({
      id: firstId,
      categoryName: "ArF 干法/浸没式光刻胶",
      isWatchlist: true,
    });
  });

  it("deletes a relation from category and company views", () => {
    const db = setupDb();
    const category = findCategoryByPath(db, ["半导体", "材料", "光刻材料", "光刻胶", "ArF 干法/浸没式光刻胶"]);
    upsertTestCompany(db, "300777", "测试材料");
    const relationId = upsertRelation(db, {
      stockCode: "300777",
      categoryId: category!.id,
      relationType: "重要相关",
      confidence: "中",
      rationale: "用于删除测试",
      isWatchlist: false,
    });

    const deletedCount = deleteRelation(db, relationId);

    expect(deletedCount).toBe(1);
    expect(listRelationsForCategory(db, category!.id).some((row) => row.stockCode === "300777")).toBe(false);
    expect(listRelationsForCompany(db, "300777")).toEqual([]);
  });

  it("updates company profile fields exactly from manual edits", () => {
    const db = setupDb();
    upsertTestCompany(db, "300778", "旧简称");

    updateCompanyProfile(db, {
      stockCode: "300778",
      shortName: "新简称",
      fullName: "新全称股份有限公司",
      board: "创业板",
      industry: "半导体材料",
      region: "江苏",
      marketCapBand: "100-300亿",
      intro: "",
      mainBusiness: "手动维护后的主营业务",
      updatedAt: "",
    });

    expect(getCompany(db, "300778")).toMatchObject({
      shortName: "新简称",
      fullName: "新全称股份有限公司",
      intro: "",
      mainBusiness: "手动维护后的主营业务",
    });
  });

  it("sorts category relation rows by relation type priority and stock code", () => {
    const db = setupDb();
    const category = findCategoryByPath(db, ["半导体", "材料", "光刻材料", "光刻胶", "ArF 干法/浸没式光刻胶"]);
    const rows = [
      ["300004", "待验证公司", "待验证"],
      ["300002", "主营公司B", "主营业务"],
      ["300003", "少量布局公司", "概念/少量布局"],
      ["300001", "主营公司A", "主营业务"],
      ["300005", "重要相关公司", "重要相关"],
    ] as const;

    for (const [stockCode, shortName, relationType] of rows) {
      upsertTestCompany(db, stockCode, shortName);
      upsertRelation(db, {
        stockCode,
        categoryId: category!.id,
        relationType,
        confidence: "中",
        rationale: shortName,
        isWatchlist: false,
      });
    }

    expect(listRelationsForCategory(db, category!.id).map((row) => [row.stockCode, row.relationType])).toEqual([
      ["300001", "主营业务"],
      ["300002", "主营业务"],
      ["300005", "重要相关"],
      ["300003", "概念/少量布局"],
      ["300004", "待验证"],
    ]);
  });

  it("creates evidence and exposes primary evidence in category relation rows", () => {
    const db = setupDb();
    const category = findCategoryByPath(db, ["半导体", "材料", "光刻材料", "光刻胶", "ArF 干法/浸没式光刻胶"]);
    upsertTestCompany(db, "300655", "晶瑞电材");
    const relationId = upsertRelation(db, {
      stockCode: "300655",
      categoryId: category!.id,
      relationType: "主营业务",
      confidence: "高",
      rationale: "光刻胶及配套电子化学品",
      isWatchlist: false,
    });

    const evidenceId = createEvidence(db, {
      relationId,
      sourceType: "公告",
      title: "晶瑞电材业务公告",
      sourceDate: "2026-01-02",
      url: "https://example.com/report",
      excerpt: "公司披露光刻胶及配套电子化学品业务。",
      credibility: "高",
      isExpired: false,
    });
    setPrimaryEvidenceForRelation(db, relationId, evidenceId);

    const evidenceRows = listEvidenceForRelation(db, relationId);
    const [relationRow] = listRelationsForCategory(db, category!.id);

    expect(evidenceRows[0]).toMatchObject({
      id: evidenceId,
      sourceType: "公告",
      title: "晶瑞电材业务公告",
      isExpired: false,
    });
    expect(relationRow.sourceType).toBe("公告");
    expect(relationRow.sourceTitle).toBe("晶瑞电材业务公告");
  });

  it("adds manual evidence to a relation and promotes it as primary evidence", () => {
    const db = setupDb();
    const category = findCategoryByPath(db, ["半导体", "材料", "光刻材料", "光刻胶", "ArF 干法/浸没式光刻胶"]);
    upsertTestCompany(db, "300655", "晶瑞电材");
    const relationId = upsertRelation(db, {
      stockCode: "300655",
      categoryId: category!.id,
      relationType: "主营业务",
      confidence: "高",
      rationale: "光刻胶及配套电子化学品",
      isWatchlist: false,
    });

    const evidence = addEvidenceToRelation(db, {
      relationId,
      sourceType: "公告",
      title: "新增公告证据",
      sourceDate: "2026-07-07",
      url: "https://example.com/notice",
      excerpt: "公司公告披露相关产品进展。",
      credibility: "高",
      isExpired: false,
    });

    const [relationRow] = listRelationsForCategory(db, category!.id);
    expect(evidence).toMatchObject({
      relationId,
      title: "新增公告证据",
      credibility: "高",
    });
    expect(relationRow.sourceTitle).toBe("新增公告证据");
  });

  it("creates and renames custom category groups under the selected parent", () => {
    const db = setupDb();
    const material = findCategoryByPath(db, ["半导体", "材料"]);

    const customId = createCategory(db, {
      name: "先进封装材料",
      parentId: material!.id,
    });
    renameCategory(db, customId, "先进封装材料-自定义");

    const custom = findCategoryByPath(db, ["半导体", "材料", "先进封装材料-自定义"]);

    expect(custom).toMatchObject({
      id: customId,
      name: "先进封装材料-自定义",
      parentId: material!.id,
      level: material!.level + 1,
    });
  });

  it("prevents listed companies from being created or renamed as category groups", () => {
    const db = setupDb();
    const material = findCategoryByPath(db, ["半导体", "材料"]);
    upsertTestCompany(db, "002636", "金安国纪");

    expect(() => createCategory(db, { name: "金安国纪", parentId: material!.id })).toThrow("请使用“添加公司”");

    const customId = createCategory(db, { name: "铜箔", parentId: material!.id });
    expect(() => renameCategory(db, customId, "金安国纪")).toThrow("请使用“添加公司”");
  });

  it("deletes a custom category branch from leaves to parent", () => {
    const db = setupDb();
    const material = findCategoryByPath(db, ["半导体", "材料"]);
    const parentId = createCategory(db, { name: "临时材料组", parentId: material!.id });
    const childId = createCategory(db, { name: "临时子组", parentId });

    const deletedCount = deleteCategoryBranch(db, parentId);

    expect(deletedCount).toBe(2);
    expect(db.prepare("select id from categories where id in (?, ?)").all(parentId, childId)).toEqual([]);
  });

  it("rejects duplicate sibling category names", () => {
    const db = setupDb();
    const material = findCategoryByPath(db, ["半导体", "材料"]);

    createCategory(db, { name: "自定义材料", parentId: material!.id });

    expect(() => createCategory(db, { name: "自定义材料", parentId: material!.id })).toThrow("同级分类已存在");
  });
});
