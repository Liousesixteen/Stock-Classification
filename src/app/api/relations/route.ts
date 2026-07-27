import type { NextRequest } from "next/server";
import { after, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { manualStockRelationInputSchema } from "@/lib/domain/schemas";
import { buildResearchProfileDraft } from "@/lib/research/profileBuilder";
import { upsertCompany } from "@/lib/repositories/companies";
import { createEvidence, deleteEvidenceForRelationByTitle } from "@/lib/repositories/evidence";
import { upsertCompanyResearchProfile } from "@/lib/repositories/researchProfiles";
import { setPrimaryEvidenceForRelation, upsertRelation } from "@/lib/repositories/relations";
import { enqueueCompanyProfileSyncTask } from "@/lib/research/companySyncQueue";
import { runSyncTaskWithRetries } from "@/lib/research/syncTaskWorker";
import { withApiObservability } from "@/lib/operations/observability";

async function postRelation(request: NextRequest) {
  const parsed = manualStockRelationInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "标的参数无效" }, { status: 400 });
  }

  try {
    const db = getDatabase();
    const input = parsed.data;
    const saveRelation = db.transaction(() => {
      upsertCompany(db, {
        stockCode: input.stockCode,
        shortName: input.shortName,
        fullName: input.fullName,
        board: input.board,
        industry: input.industry,
        region: input.region,
        marketCapBand: input.marketCapBand,
        intro: input.intro,
        mainBusiness: input.mainBusiness,
        updatedAt: "",
      });

      const relationId = upsertRelation(db, {
        stockCode: input.stockCode,
        categoryId: input.categoryId,
        relationType: input.relationType,
        confidence: input.confidence,
        rationale: input.rationale,
        isWatchlist: input.isWatchlist,
        direction: input.direction,
        strength: input.strength,
        observedAt: input.observedAt,
      });

      if (input.evidence) {
        const evidenceTitle = input.evidence.title || input.evidence.url || `自动同步资料：${input.shortName}`;
        deleteEvidenceForRelationByTitle(db, relationId, evidenceTitle);
        const evidenceId = createEvidence(db, {
          relationId,
          sourceType: input.evidence.sourceType,
          title: evidenceTitle,
          sourceDate: input.evidence.sourceDate,
          url: input.evidence.url,
          excerpt: input.evidence.excerpt,
          credibility: input.evidence.credibility ?? input.confidence,
          isExpired: input.evidence.isExpired,
        });
        setPrimaryEvidenceForRelation(db, relationId, evidenceId);
      }

      const researchProfile = input.researchProfilePatch
        ? {
            stockCode: input.stockCode,
            ...input.researchProfilePatch,
          }
        : buildResearchProfileDraft({
            stockCode: input.stockCode,
            shortName: input.shortName,
            industry: input.industry,
            intro: input.intro,
            mainBusiness: input.mainBusiness,
            relations: [
              {
                categoryName: "",
                relationType: input.relationType,
                confidence: input.confidence,
                rationale: input.rationale,
              },
            ],
            evidenceTitles: input.evidence ? [input.evidence.title || input.evidence.url || `自动同步资料：${input.shortName}`] : [],
          });
      upsertCompanyResearchProfile(db, researchProfile);

      const queued = enqueueCompanyProfileSyncTask(db, {
        stockCode: input.stockCode,
        categoryId: input.categoryId,
      });
      return { relationId, queued };
    });

    const saved = saveRelation();
    if (saved.queued.task.status === "pending" || saved.queued.task.status === "running") {
      after(async () => {
        await runSyncTaskWithRetries(saved.queued.task.id).catch(() => undefined);
      });
    }
    return NextResponse.json(
      {
        relationId: saved.relationId,
        task: saved.queued.task,
        deduplicated: saved.queued.deduplicated,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存标的失败" }, { status: 400 });
  }
}

export const POST = withApiObservability("relation.create", postRelation, { audit: true });
