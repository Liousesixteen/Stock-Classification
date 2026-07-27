import type Database from "better-sqlite3";
import { getCompany } from "@/lib/repositories/companies";
import { listCompanyFieldFacts } from "@/lib/repositories/companyFieldFacts";
import { listEvidenceForRelation } from "@/lib/repositories/evidence";
import { getCompanyResearchProfile } from "@/lib/repositories/researchProfiles";
import { listRelationsForCompany } from "@/lib/repositories/relations";
import { listSourceSnapshots } from "@/lib/repositories/sourceSnapshots";
import { assessCompanyDossierQuality } from "./companyDossierQuality";
import { buildCompanyEvidenceTimeline } from "./companyEvidenceTimeline";
import { buildDisplayResearchProfile } from "./profileBuilder";

export function buildCompanyDossierModel(db: Database.Database, stockCode: string) {
  const company = getCompany(db, stockCode);
  if (!company) return null;

  const relations = listRelationsForCompany(db, stockCode);
  const evidenceByRelationId = Object.fromEntries(
    relations.map((relation) => [relation.id, listEvidenceForRelation(db, relation.id)]),
  );
  const evidenceTitles = relations.flatMap(
    (relation) => evidenceByRelationId[relation.id]?.map((evidence) => evidence.title) ?? [],
  );
  const researchProfile = buildDisplayResearchProfile({
    company,
    relations,
    evidenceTitles,
    existingProfile: getCompanyResearchProfile(db, stockCode),
  });
  const sourceSnapshots = listSourceSnapshots(db, stockCode);
  const fieldFacts = listCompanyFieldFacts(db, stockCode);

  return {
    company,
    relations,
    evidenceByRelationId,
    researchProfile,
    sourceSnapshots,
    fieldFacts,
    quality: assessCompanyDossierQuality({
      company,
      relations,
      evidenceByRelationId,
      researchProfile,
      sourceSnapshots,
      fieldFacts,
    }),
    evidenceTimeline: buildCompanyEvidenceTimeline({
      relations,
      evidenceByRelationId,
      fieldFacts,
      researchProfile,
    }),
  };
}

export type CompanyDossierModel = NonNullable<ReturnType<typeof buildCompanyDossierModel>>;
