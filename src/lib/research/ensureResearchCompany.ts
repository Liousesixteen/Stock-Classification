import type Database from "better-sqlite3";
import { lookupFastStockProfile, lookupStockProfile, type StockLookupProfile } from "@/lib/datasources/stockLookup";
import { getCompany, upsertCompany } from "@/lib/repositories/companies";

export async function ensureResearchCompany(db: Database.Database, stockCode: string) {
  const existing = getCompany(db, stockCode);
  if (existing) return existing;

  let profile: StockLookupProfile;
  try {
    profile = await lookupStockProfile(stockCode);
  } catch {
    profile = lookupFastStockProfile(stockCode);
  }

  upsertCompany(db, {
    stockCode: profile.stockCode,
    shortName: profile.shortName,
    fullName: profile.fullName,
    board: profile.board,
    industry: profile.industry,
    region: profile.region,
    marketCapBand: profile.marketCapBand,
    intro: profile.intro,
    mainBusiness: profile.mainBusiness,
    updatedAt: "",
  });

  return getCompany(db, stockCode);
}
