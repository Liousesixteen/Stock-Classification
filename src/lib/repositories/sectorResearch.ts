import type Database from "better-sqlite3";
import type { BusinessLine } from "./researchProfiles";

export type SectorResearchCompany = {
  relationId: number;
  stockCode: string;
  shortName: string;
  board: string;
  industry: string;
  marketCapBand: string;
  relationType: string;
  confidence: string;
  isWatchlist: boolean;
  evidenceCount: number;
  categoryNames: string[];
  summary: string;
  businessLines: BusinessLine[];
  hasResearchProfile: boolean;
  updatedAt: string;
};

export type SectorResearchData = {
  category: { id: number; name: string; parentId: number | null; level: number; description: string; industry: string };
  path: Array<{ id: number; name: string }>;
  subcategories: Array<{ id: number; name: string; companyCount: number }>;
  companies: SectorResearchCompany[];
  stats: { categoryCount: number; companyCount: number; evidenceCount: number; highConfidenceCount: number; profileCoverage: number };
};

type CategoryRow = SectorResearchData["category"];
type RelationRow = {
  relationId: number;
  stockCode: string;
  shortName: string;
  board: string;
  industry: string;
  marketCapBand: string;
  intro: string;
  mainBusiness: string;
  updatedAt: string;
  categoryId: number;
  categoryName: string;
  relationType: string;
  confidence: string;
  isWatchlist: number;
  evidenceCount: number;
  profileSummary: string;
  businessLines: string;
};

export function getDefaultSectorCategoryId(db: Database.Database) {
  const row = db
    .prepare(
      `
        select c.id
        from categories c
        join company_category_relations r on r.category_id = c.id
        join companies company on company.stock_code = r.stock_code
        where c.is_active = 1
        group by c.id
        order by count(r.id) desc, c.level desc, c.sort_order, c.id
        limit 1
      `,
    )
    .get() as { id: number } | undefined;
  return row?.id;
}

export function getSectorResearch(db: Database.Database, categoryId: number): SectorResearchData | null {
  const category = db
    .prepare(
      `select id, name, parent_id as parentId, level, description, industry from categories where id = ? and is_active = 1`,
    )
    .get(categoryId) as CategoryRow | undefined;
  if (!category) return null;

  const branch = db
    .prepare(
      `
        with recursive branch(id) as (
          select id from categories where id = ? and is_active = 1
          union all
          select c.id from categories c join branch b on c.parent_id = b.id where c.is_active = 1
        )
        select c.id, c.name, c.parent_id as parentId, c.level, c.description, c.industry
        from categories c join branch b on b.id = c.id
        order by c.level, c.sort_order, c.id
      `,
    )
    .all(categoryId) as CategoryRow[];

  const path = db
    .prepare(
      `
        with recursive path(id, name, parent_id, depth) as (
          select id, name, parent_id, 0 from categories where id = ?
          union all
          select c.id, c.name, c.parent_id, path.depth + 1 from categories c join path on path.parent_id = c.id
        )
        select id, name from path order by depth desc
      `,
    )
    .all(categoryId) as Array<{ id: number; name: string }>;

  const rows = db
    .prepare(
      `
        with recursive branch(id) as (
          select id from categories where id = ? and is_active = 1
          union all
          select c.id from categories c join branch b on c.parent_id = b.id where c.is_active = 1
        )
        select
          r.id as relationId,
          company.stock_code as stockCode,
          company.short_name as shortName,
          company.board,
          company.industry,
          company.market_cap_band as marketCapBand,
          company.intro,
          company.main_business as mainBusiness,
          company.updated_at as updatedAt,
          category.id as categoryId,
          category.name as categoryName,
          r.relation_type as relationType,
          r.confidence,
          r.is_watchlist as isWatchlist,
          count(e.id) as evidenceCount,
          coalesce(profile.summary, '') as profileSummary,
          coalesce(profile.business_lines, '[]') as businessLines
        from company_category_relations r
        join branch on branch.id = r.category_id
        join categories category on category.id = r.category_id
        join companies company on company.stock_code = r.stock_code
        left join evidences e on e.relation_id = r.id and e.is_expired = 0
        left join company_research_profiles profile on profile.stock_code = company.stock_code
        group by r.id
        order by r.stock_code, r.category_id
      `,
    )
    .all(categoryId) as RelationRow[];

  const companies = aggregateCompanies(rows);
  const directChildren = branch.filter((item) => item.parentId === categoryId);
  const subcategories = directChildren.map((item) => ({
    id: item.id,
    name: item.name,
    companyCount: new Set(rows.filter((row) => row.categoryId === item.id).map((row) => row.stockCode)).size,
  }));
  const evidenceCount = companies.reduce((sum, company) => sum + company.evidenceCount, 0);
  const highConfidenceCount = companies.filter((company) => company.confidence === "高").length;
  // Fallback summaries help with orientation, but they are not curated research.
  const profileCount = companies.filter((company) => company.hasResearchProfile).length;

  return {
    category,
    path,
    subcategories,
    companies,
    stats: {
      categoryCount: branch.length,
      companyCount: companies.length,
      evidenceCount,
      highConfidenceCount,
      profileCoverage: companies.length ? Math.round((profileCount / companies.length) * 100) : 0,
    },
  };
}

function aggregateCompanies(rows: RelationRow[]) {
  const companies = new Map<string, SectorResearchCompany>();
  for (const row of rows) {
    const current = companies.get(row.stockCode);
    const candidate = {
      stockCode: row.stockCode,
      relationId: row.relationId,
      shortName: row.shortName,
      board: row.board,
      industry: row.industry,
      marketCapBand: row.marketCapBand,
      relationType: row.relationType,
      confidence: row.confidence,
      isWatchlist: row.isWatchlist === 1,
      evidenceCount: Number(row.evidenceCount),
      categoryNames: [row.categoryName],
      summary: row.profileSummary || row.intro || row.mainBusiness,
      businessLines: parseBusinessLines(row.businessLines),
      hasResearchProfile: Boolean(row.profileSummary.trim()) || parseBusinessLines(row.businessLines).length > 0,
      updatedAt: row.updatedAt,
    } satisfies SectorResearchCompany;
    if (!current) {
      companies.set(row.stockCode, candidate);
      continue;
    }
    current.categoryNames = [...new Set([...current.categoryNames, row.categoryName])];
    current.evidenceCount += Number(row.evidenceCount);
    if (relationRank(row.relationType) < relationRank(current.relationType)) {
      current.relationType = row.relationType;
      current.relationId = row.relationId;
      current.isWatchlist = row.isWatchlist === 1;
    }
    if (confidenceRank(row.confidence) < confidenceRank(current.confidence)) current.confidence = row.confidence;
    if (!current.summary && candidate.summary) current.summary = candidate.summary;
    if (!current.businessLines.length && candidate.businessLines.length) current.businessLines = candidate.businessLines;
    current.hasResearchProfile ||= candidate.hasResearchProfile;
  }
  return [...companies.values()].sort((left, right) => relationRank(left.relationType) - relationRank(right.relationType) || right.evidenceCount - left.evidenceCount || left.stockCode.localeCompare(right.stockCode));
}

function parseBusinessLines(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is BusinessLine => Boolean(item) && typeof item === "object" && "name" in item && typeof item.name === "string")
      : [];
  } catch {
    return [];
  }
}

function relationRank(value: string) {
  return ["主营业务", "重要相关", "概念/少量布局", "待验证"].indexOf(value) + 1 || 99;
}

function confidenceRank(value: string) {
  return ["高", "中", "低"].indexOf(value) + 1 || 99;
}
