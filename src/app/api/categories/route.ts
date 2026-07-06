import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { getCategoryTree } from "@/lib/repositories/categories";

export async function GET() {
  const db = getDatabase();
  return NextResponse.json({ categories: getCategoryTree(db) });
}
