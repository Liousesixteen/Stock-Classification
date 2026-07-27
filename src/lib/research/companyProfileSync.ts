import type Database from "better-sqlite3";
import {
  organizeStockFactsWithConfiguredAgent,
} from "@/lib/agents/classificationAgentProvider";
import type { ClassificationAgentResult } from "@/lib/agents/classificationAgent";
import {
  lookupFastStockProfile,
  lookupStockProfileWithTrace,
  type StockLookupProfile,
  type StockLookupWithTrace,
} from "@/lib/datasources/stockLookup";
import { getDatabase } from "@/lib/db/client";
import { getCategoryById } from "@/lib/repositories/categories";
import { upsertCompanyFieldFact } from "@/lib/repositories/companyFieldFacts";
import { getCompany, upsertCompany } from "@/lib/repositories/companies";
import { createEvidence, deleteEvidenceForRelationByTitle } from "@/lib/repositories/evidence";
import { upsertCompanyResearchProfile } from "@/lib/repositories/researchProfiles";
import { listRelationsForCompany, setPrimaryEvidenceForRelation, upsertRelation } from "@/lib/repositories/relations";
import { getFreshSourceSnapshot, listSourceSnapshots, upsertSourceSnapshot } from "@/lib/repositories/sourceSnapshots";
import { updateSyncTask } from "@/lib/repositories/syncTasks";

export const COMPANY_PROFILE_SYNC_TASK_TYPE = "company_research_profile";
export const AGGREGATED_PROFILE_PROVIDER = "aggregated_profile";

const AGGREGATED_PROFILE_CACHE_MS = 10 * 60 * 1000;
const FAILURE_CACHE_MS = 30 * 60 * 1000;

type SyncInput = {
  stockCode: string;
  categoryId?: number;
  taskId: number;
  force?: boolean;
};

type SyncDependencies = {
  db?: Database.Database;
  lookup?: typeof lookupStockProfileWithTrace;
  organize?: typeof organizeStockFactsWithConfiguredAgent;
  now?: () => Date;
};

type RelationSnapshot = ReturnType<typeof listRelationsForCompany>[number];

type RelationAnalysis = {
  relation: RelationSnapshot;
  result: ClassificationAgentResult;
};

export async function runCompanyProfileSync(input: SyncInput, dependencies: SyncDependencies = {}) {
  const db = dependencies.db ?? getDatabase();
  const lookup = dependencies.lookup ?? lookupStockProfileWithTrace;
  const organize = dependencies.organize ?? organizeStockFactsWithConfiguredAgent;
  const now = dependencies.now ?? (() => new Date());

  updateSyncTask(db, input.taskId, {
    status: "running",
    message: "正在同步公司资料、产业关系与证据",
    progress: 10,
  });

  try {
    const existingCompany = getCompany(db, input.stockCode);
    const relationSnapshots = selectTargetRelations(db, input.stockCode, input.categoryId);
    if (relationSnapshots.length === 0) {
      throw new Error("待同步的分类关系不存在");
    }

    const lookupResult = await resolveProfile({
      db,
      stockCode: input.stockCode,
      force: input.force === true,
      lookup,
      now,
      existingCompany,
    });

    const analyses = await Promise.all(
      relationSnapshots.map(async (relation): Promise<RelationAnalysis> => {
        const category = getCategoryById(db, relation.categoryId);
        if (!category) throw new Error(`分类 ${relation.categoryId} 不存在`);
        return {
          relation,
          result: await organize({ profile: lookupResult.profile, category }),
        };
      }),
    );

    const persistedRelations = persistSyncResult(db, input.stockCode, lookupResult.profile, analyses);
    if (persistedRelations === 0) {
      throw new Error("分类关系已被删除，本次后台补全已取消");
    }

    updateSyncTask(db, input.taskId, {
      status: lookupResult.partial ? "partial" : "success",
      message: lookupResult.partial
        ? `资料已部分补全，已更新 ${persistedRelations} 条分类关系，失败来源可稍后重试`
        : lookupResult.fromCache
          ? "资料已从本地快照补全"
          : `资料补全完成，已更新 ${persistedRelations} 条分类关系`,
      progress: 100,
    });

    return {
      stockCode: input.stockCode,
      relationCount: persistedRelations,
      fromCache: lookupResult.fromCache,
      partial: lookupResult.partial,
      failedProviders: lookupResult.failedProviders,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "公司资料同步失败";
    updateSyncTask(db, input.taskId, {
      status: "failed",
      message: "资料补全失败，可稍后重试",
      error: message,
    });
    throw error;
  }
}

function selectTargetRelations(db: Database.Database, stockCode: string, categoryId?: number) {
  const relations = listRelationsForCompany(db, stockCode);
  return categoryId === undefined ? relations : relations.filter((relation) => relation.categoryId === categoryId);
}

async function resolveProfile(input: {
  db: Database.Database;
  stockCode: string;
  force: boolean;
  lookup: typeof lookupStockProfileWithTrace;
  now: () => Date;
  existingCompany: ReturnType<typeof getCompany>;
}) {
  if (!input.force) {
    const cached = getFreshSourceSnapshot(input.db, input.stockCode, AGGREGATED_PROFILE_PROVIDER, input.now());
    const profile = cached ? parseCachedProfile(cached.facts.profile) : null;
    if (profile) {
      const sourceSnapshots = listSourceSnapshots(input.db, input.stockCode).filter(
        (snapshot) => snapshot.provider !== AGGREGATED_PROFILE_PROVIDER,
      );
      return {
        profile,
        fromCache: true,
        partial: sourceSnapshots.some((snapshot) => snapshot.status === "failed"),
        failedProviders: sourceSnapshots
          .filter((snapshot) => snapshot.status === "failed")
          .map((snapshot) => snapshot.provider),
      };
    }
  }

  try {
    const result = await input.lookup(input.stockCode, undefined, { providerTimeoutMs: 3_500 });
    persistLookupSnapshots(input.db, result, input.now());
    return {
      profile: result.profile,
      fromCache: false,
      partial: result.traces.some((trace) => trace.status === "failed"),
      failedProviders: result.traces
        .filter((trace) => trace.status === "failed")
        .map((trace) => trace.provider),
    };
  } catch (error) {
    const fallback = buildFallbackProfile(input.stockCode, input.existingCompany);
    const current = input.now();
    upsertSourceSnapshot(input.db, {
      stockCode: input.stockCode,
      provider: AGGREGATED_PROFILE_PROVIDER,
      providerLabel: "聚合公司资料",
      status: "failed",
      error: error instanceof Error ? error.message : "数据源同步失败",
      fetchedAt: toSqliteTimestamp(current),
      expiresAt: toSqliteTimestamp(new Date(current.getTime() + FAILURE_CACHE_MS)),
    });
    return {
      profile: fallback,
      fromCache: false,
      partial: true,
      failedProviders: [AGGREGATED_PROFILE_PROVIDER],
    };
  }
}

function persistLookupSnapshots(db: Database.Database, result: StockLookupWithTrace, current: Date) {
  for (const trace of result.traces) {
    upsertSourceSnapshot(db, {
      stockCode: result.profile.stockCode,
      provider: trace.provider,
      providerLabel: trace.providerLabel,
      status: trace.status,
      facts: trace.facts,
      error: trace.error,
      durationMs: trace.durationMs,
      fetchedAt: toSqliteTimestamp(current),
      expiresAt: toSqliteTimestamp(
        new Date(current.getTime() + (trace.status === "success" ? trace.cacheTtlMs : FAILURE_CACHE_MS)),
      ),
    });

    for (const fieldKey of trace.expectedFields) {
      const value = trace.facts[fieldKey];
      upsertCompanyFieldFact(db, {
        stockCode: result.profile.stockCode,
        fieldKey,
        provider: trace.provider,
        providerLabel: trace.providerLabel,
        value,
        status: getFieldFactStatus(trace.status, value),
        sourceUrl: trace.sourceUrl,
        confidence: trace.confidence,
        verificationStatus: "unverified",
        error: trace.error,
        fetchedAt: toSqliteTimestamp(current),
      });
    }
  }

  upsertSourceSnapshot(db, {
    stockCode: result.profile.stockCode,
    provider: AGGREGATED_PROFILE_PROVIDER,
    providerLabel: "聚合公司资料",
    status: "success",
    facts: { profile: result.profile },
    fetchedAt: toSqliteTimestamp(current),
    expiresAt: toSqliteTimestamp(new Date(current.getTime() + AGGREGATED_PROFILE_CACHE_MS)),
  });
}

function getFieldFactStatus(status: StockLookupWithTrace["traces"][number]["status"], value: unknown) {
  if (status === "failed") return "failed" as const;
  if (status === "skipped") return "skipped" as const;
  if (value === null || value === undefined || value === "") return "missing" as const;
  if (Array.isArray(value) && value.length === 0) return "missing" as const;
  return "available" as const;
}

function persistSyncResult(
  db: Database.Database,
  stockCode: string,
  profile: StockLookupProfile,
  analyses: RelationAnalysis[],
) {
  return db.transaction(() => {
    const currentRelations = new Map(listRelationsForCompany(db, stockCode).map((relation) => [relation.categoryId, relation]));
    const validAnalyses = analyses.filter(({ relation }) => currentRelations.get(relation.categoryId)?.id === relation.id);
    if (validAnalyses.length === 0) return 0;

    const existingCompany = getCompany(db, stockCode);
    const primary = validAnalyses[0].result;
    upsertCompany(db, {
      stockCode,
      shortName: firstText(profile.shortName, existingCompany?.shortName, stockCode),
      fullName: firstText(primary.companyProfilePatch.fullName, profile.fullName, existingCompany?.fullName),
      board: firstText(primary.companyProfilePatch.board, profile.board, existingCompany?.board),
      industry: firstText(primary.companyProfilePatch.industry, profile.industry, existingCompany?.industry),
      region: firstText(primary.companyProfilePatch.region, profile.region, existingCompany?.region),
      marketCapBand: firstText(
        primary.companyProfilePatch.marketCapBand,
        profile.marketCapBand,
        existingCompany?.marketCapBand,
      ),
      intro: firstText(primary.companyProfilePatch.intro, profile.intro, existingCompany?.intro),
      mainBusiness: firstText(
        primary.companyProfilePatch.mainBusiness,
        profile.mainBusiness,
        profile.businessScope,
        existingCompany?.mainBusiness,
      ),
      updatedAt: "",
    });

    for (const { relation, result } of validAnalyses) {
      const currentRelation = currentRelations.get(relation.categoryId);
      if (!currentRelation) continue;
      const relationId = upsertRelation(db, {
        stockCode,
        categoryId: relation.categoryId,
        relationType: result.relationType,
        confidence: result.confidence,
        rationale: result.rationale,
        isWatchlist: currentRelation.isWatchlist,
      });
      deleteEvidenceForRelationByTitle(db, relationId, result.evidence.title);
      const evidenceId = createEvidence(db, {
        relationId,
        sourceType: result.evidence.sourceType,
        title: result.evidence.title,
        sourceDate: result.evidence.sourceDate,
        url: result.evidence.url,
        excerpt: result.evidence.excerpt,
        credibility: result.evidence.credibility,
        isExpired: false,
      });
      setPrimaryEvidenceForRelation(db, relationId, evidenceId);
    }

    upsertCompanyResearchProfile(db, {
      stockCode,
      ...primary.researchProfilePatch,
    });
    return validAnalyses.length;
  })();
}

function buildFallbackProfile(stockCode: string, existingCompany: ReturnType<typeof getCompany>): StockLookupProfile {
  const fast = lookupFastStockProfile(stockCode);
  return {
    ...fast,
    shortName: firstText(existingCompany?.shortName, fast.shortName, stockCode),
    fullName: firstText(existingCompany?.fullName, fast.fullName),
    board: firstText(existingCompany?.board, fast.board),
    industry: firstText(existingCompany?.industry, fast.industry),
    region: firstText(existingCompany?.region, fast.region),
    marketCapBand: firstText(existingCompany?.marketCapBand, fast.marketCapBand),
    intro: firstText(existingCompany?.intro, fast.intro),
    mainBusiness: firstText(existingCompany?.mainBusiness, fast.mainBusiness),
  };
}

function parseCachedProfile(value: unknown): StockLookupProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const profile = value as Partial<StockLookupProfile>;
  if (typeof profile.stockCode !== "string" || typeof profile.shortName !== "string") return null;
  if (!Array.isArray(profile.sourceFacts) || !Array.isArray(profile.concepts) || !Array.isArray(profile.mainProducts)) {
    return null;
  }
  return profile as StockLookupProfile;
}

function firstText(...values: Array<string | undefined>) {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

function toSqliteTimestamp(value: Date) {
  return value.toISOString().replace("T", " ").slice(0, 19);
}
