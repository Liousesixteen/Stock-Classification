import * as XLSX from "xlsx";

export type ParsedWorkbookRow = Record<string, unknown>;

export function parseWorkbook(buffer: Buffer): ParsedWorkbookRow[] {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
    raw: false,
  });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<ParsedWorkbookRow>(sheet, {
    defval: "",
    raw: false,
  });
}
