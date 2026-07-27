import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { commitImportRows } from "@/lib/import/commit";
import { importCommitSchema, previewImportRows } from "@/lib/import/preview";
import { getCompany } from "@/lib/repositories/companies";
import { listRelationsForCategory } from "@/lib/repositories/relations";

function setupDb() {
  const db = new Database(":memory:");
  migrate(db);
  seedSemiconductorData(db);
  return db;
}

describe("import preview", () => {
  it("validates rows and maps category paths", () => {
    const db = setupDb();

    const preview = previewImportRows(db, [
      {
        股票代码: "300655",
        公司简称: "晶瑞电材",
        分类路径: "半导体/材料/光刻材料/光刻胶/ArF 干法/浸没式光刻胶",
        关系类型: "主营业务",
        确信度: "高",
        判断说明: "光刻胶及配套电子化学品",
        来源类型: "年报",
        来源标题: "2025 年报",
        来源链接: "https://example.com/report",
      },
    ]);

    expect(preview.validRows).toHaveLength(1);
    expect(preview.errors).toHaveLength(0);
    expect(preview.validRows[0].categoryPath).toContain("ArF 干法/浸没式光刻胶");
  });

  it("reports unknown categories and invalid relation types", () => {
    const db = setupDb();

    const preview = previewImportRows(db, [
      {
        股票代码: "300655",
        公司简称: "晶瑞电材",
        分类路径: "半导体/材料/不存在",
        关系类型: "乱写",
        确信度: "高",
      },
    ]);

    expect(preview.validRows).toHaveLength(0);
    expect(preview.errors[0].messages).toContain("分类路径不存在");
    expect(preview.errors[0].messages).toContain("关系类型无效");
  });

  it("commits valid rows with company, relation, primary evidence, and note", () => {
    const db = setupDb();
    const preview = previewImportRows(db, [
      {
        股票代码: "300655",
        公司简称: "晶瑞电材",
        分类路径: "半导体/材料/光刻材料/光刻胶/KrF 光刻胶",
        关系类型: "主营业务",
        确信度: "高",
        判断说明: "光刻胶及配套电子化学品",
        来源类型: "公告",
        来源标题: "业务公告",
        来源链接: "https://example.com/notice",
        公司简介: "晶瑞电材示例简介",
        研究备注: "关注收入占比",
      },
    ]);

    const result = commitImportRows(db, preview.validRows);
    const company = getCompany(db, "300655");
    const rows = listRelationsForCategory(db, preview.validRows[0].categoryId);
    const note = db.prepare("select content from research_notes where target_type = 'company' and target_id = ?").get("300655") as
      | { content: string }
      | undefined;

    expect(result).toEqual({
      companiesUpserted: 1,
      relationsUpserted: 1,
      evidencesCreated: 1,
      notesCreated: 1,
    });
    expect(company?.intro).toBe("晶瑞电材示例简介");
    expect(rows[0]).toMatchObject({
      stockCode: "300655",
      sourceType: "公告",
      sourceTitle: "业务公告",
    });
    expect(note?.content).toBe("关注收入占比");
  });

  it("does not erase existing company basics when import rows omit them", () => {
    const db = setupDb();
    const beforeCompany = getCompany(db, "300346");
    const preview = previewImportRows(db, [
      {
        股票代码: "300346",
        公司简称: "南大光电",
        分类路径: "半导体/材料/光刻材料/光刻胶/KrF 光刻胶",
        关系类型: "重要相关",
        确信度: "中",
        判断说明: "导入补充关系",
      },
    ]);

    commitImportRows(db, preview.validRows);
    const company = getCompany(db, "300346");

    expect(company?.board).toBe("创业板");
    expect(company?.industry).toBe("电子材料");
    expect(company?.intro).toBe(beforeCompany?.intro);
  });

  it("rejects tampered commit rows that bypass the preview contract", () => {
    const parsed = importCommitSchema.safeParse({
      rows: [{
        stockCode: "not-a-stock",
        shortName: "篡改数据",
        categoryId: -1,
        categoryPath: [],
        relationType: "任意关系",
        confidence: "超高",
        rationale: "",
        sourceType: "未知来源",
        sourceTitle: "",
        sourceUrl: "",
        sourceDate: "",
        sourceExcerpt: "",
        intro: "",
        note: "",
      }],
    });
    expect(parsed.success).toBe(false);
  });
});
