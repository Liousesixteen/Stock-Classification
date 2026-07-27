import type Database from "better-sqlite3";

export type CompanyNoteInput = {
  stockCode: string;
  noteType: string;
  content: string;
  tags?: string[];
};

export type CompanyNote = {
  id: number;
  targetType: "company";
  targetId: string;
  noteType: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type CompanyNoteRow = Omit<CompanyNote, "tags"> & {
  tags: string;
};

export function listCompanyNotes(db: Database.Database, stockCode: string): CompanyNote[] {
  const rows = db
    .prepare(
      `
        select
          id,
          target_type as targetType,
          target_id as targetId,
          note_type as noteType,
          content,
          tags,
          created_at as createdAt,
          updated_at as updatedAt
        from research_notes
        where target_type = 'company' and target_id = ?
        order by updated_at desc, id desc
      `,
    )
    .all(stockCode) as CompanyNoteRow[];

  return rows.map((row) => ({ ...row, targetType: "company", tags: parseTags(row.tags) }));
}

export function upsertCompanyNote(db: Database.Database, input: CompanyNoteInput): CompanyNote {
  const existing = db
    .prepare(
      `
        select id
        from research_notes
        where target_type = 'company' and target_id = ? and note_type = ?
        order by id desc
        limit 1
      `,
    )
    .get(input.stockCode, input.noteType) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `
        update research_notes
        set content = ?,
            tags = ?,
            updated_at = current_timestamp
        where id = ?
      `,
    ).run(input.content.trim(), JSON.stringify(input.tags ?? []), existing.id);
  } else {
    db.prepare(
      `
        insert into research_notes (target_type, target_id, note_type, content, tags)
        values ('company', ?, ?, ?, ?)
      `,
    ).run(input.stockCode, input.noteType, input.content.trim(), JSON.stringify(input.tags ?? []));
  }

  return listCompanyNotes(db, input.stockCode).find((note) => note.noteType === input.noteType)!;
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
