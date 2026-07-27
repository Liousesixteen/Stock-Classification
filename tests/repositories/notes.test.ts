import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { listCompanyNotes, upsertCompanyNote } from "@/lib/repositories/notes";

describe("research notes repository", () => {
  it("upserts one company note per note type", () => {
    const db = new Database(":memory:");
    migrate(db);

    upsertCompanyNote(db, {
      stockCode: "600584",
      noteType: "我的备注",
      content: "第一版备注",
      tags: ["user"],
    });
    upsertCompanyNote(db, {
      stockCode: "600584",
      noteType: "我的备注",
      content: "更新后的备注",
      tags: ["user"],
    });

    const notes = listCompanyNotes(db, "600584");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      targetType: "company",
      targetId: "600584",
      noteType: "我的备注",
      content: "更新后的备注",
      tags: ["user"],
    });
  });
});
