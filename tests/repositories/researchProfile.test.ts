import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { upsertCompany } from "@/lib/repositories/companies";
import {
  getCompanyResearchProfile,
  upsertCompanyResearchProfile,
} from "@/lib/repositories/researchProfiles";
import {
  createSyncTask,
  getLatestSyncTaskForStock,
  getSyncTaskById,
  listSyncTasksForStock,
  updateSyncTask,
} from "@/lib/repositories/syncTasks";

function setupDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  upsertCompany(db, {
    stockCode: "600584",
    shortName: "长电科技",
    fullName: "江苏长电科技股份有限公司",
    board: "沪市主板",
    industry: "半导体",
    region: "江苏",
    marketCapBand: ">1000亿",
    intro: "集成电路制造与技术服务提供商。",
    mainBusiness: "芯片成品制造、测试、封装。",
    updatedAt: "",
  });
  return db;
}

describe("research profile repositories", () => {
  it("upserts and reads structured company research fields", () => {
    const db = setupDb();

    upsertCompanyResearchProfile(db, {
      stockCode: "600584",
      summary: "封测龙头，覆盖成品制造与测试。",
      businessLines: [
        { name: "芯片成品制造", share: "占比待补", grossMargin: "毛利率待补" },
        { name: "测试服务", share: "占比待补", grossMargin: "毛利率待补" },
      ],
      chainPosition: ["封测环节", "下游覆盖消费电子、汽车电子等"],
      competitiveAdvantages: ["全球化封测产能", "客户覆盖面广"],
      keyCustomers: ["客户待补"],
      catalysts: ["先进封装需求提升"],
      risks: ["半导体周期波动"],
      sourceSummary: "自动同步资料：长电科技",
    });

    expect(getCompanyResearchProfile(db, "600584")).toMatchObject({
      stockCode: "600584",
      summary: "封测龙头，覆盖成品制造与测试。",
      businessLines: [
        { name: "芯片成品制造", share: "占比待补", grossMargin: "毛利率待补" },
        { name: "测试服务", share: "占比待补", grossMargin: "毛利率待补" },
      ],
      chainPosition: ["封测环节", "下游覆盖消费电子、汽车电子等"],
      competitiveAdvantages: ["全球化封测产能", "客户覆盖面广"],
      keyCustomers: ["客户待补"],
      catalysts: ["先进封装需求提升"],
      risks: ["半导体周期波动"],
      sourceSummary: "自动同步资料：长电科技",
    });
  });

  it("tracks sync task status and returns the latest task for a stock", () => {
    const db = setupDb();

    const firstTaskId = createSyncTask(db, {
      stockCode: "600584",
      taskType: "company_research_profile",
      source: "eastmoney+agent",
      status: "running",
      message: "正在补全结构化资料",
    });
    updateSyncTask(db, firstTaskId, {
      status: "success",
      message: "结构化资料已写入",
    });
    const secondTaskId = createSyncTask(db, {
      stockCode: "600584",
      taskType: "company_research_profile",
      source: "eastmoney+agent",
      status: "failed",
      message: "同步失败",
      error: "上游超时",
    });

    expect(listSyncTasksForStock(db, "600584").map((task) => task.id)).toEqual([secondTaskId, firstTaskId]);
    expect(getSyncTaskById(db, firstTaskId)).toMatchObject({
      id: firstTaskId,
      status: "success",
      message: "结构化资料已写入",
    });
    expect(getLatestSyncTaskForStock(db, "600584", "company_research_profile")).toMatchObject({
      id: secondTaskId,
      stockCode: "600584",
      taskType: "company_research_profile",
      source: "eastmoney+agent",
      status: "failed",
      message: "同步失败",
      error: "上游超时",
    });
  });
});
