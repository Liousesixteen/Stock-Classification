import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { StoredResearchDocument } from "@/lib/repositories/researchDocuments";

export type ResearchDocumentExportFormat = "markdown" | "docx" | "pdf";

export async function createResearchDocumentExport(
  report: StoredResearchDocument,
  format: ResearchDocumentExportFormat,
): Promise<Uint8Array> {
  if (format === "markdown") return new TextEncoder().encode(report.markdown);
  if (format === "docx") return createDocx(report);
  return createPdf(report);
}

async function createDocx(report: StoredResearchDocument) {
  const children: Array<Paragraph | Table> = markdownToDocx(report.markdown);
  for (const chart of report.charts) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun(chart.title)],
    }));
    const columnWidths = [4513, 2256, 2257];
    const border = { style: BorderStyle.SINGLE, size: 1, color: "AEB9C8" };
    const borders = { top: border, bottom: border, left: border, right: border };
    const cell = (text: string, width: number, header = false) => new TableCell({
      width: { size: width, type: WidthType.DXA },
      borders,
      shading: header ? { fill: "E8EEF5", type: ShadingType.CLEAR } : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({ text, bold: header })],
      })],
    });
    children.push(new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths,
      rows: [
        new TableRow({ children: [cell("项目", columnWidths[0]!, true), cell(`数值（${chart.unit}）`, columnWidths[1]!, true), cell("辅助指标", columnWidths[2]!, true)] }),
        ...chart.rows.map((row) => new TableRow({
          children: [
            cell(row.label, columnWidths[0]!),
            cell(String(row.value), columnWidths[1]!),
            cell(row.secondary === undefined ? "—" : String(row.secondary), columnWidths[2]!),
          ],
        })),
      ],
    }));
  }

  const doc = new Document({
    creator: "A 股产业链研究工作台",
    title: report.title,
    description: report.executiveSummary,
    numbering: {
      config: [{
        reference: "report-bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 260 } } },
        }],
      }],
    },
    styles: {
      default: { document: { run: { font: "Noto Sans CJK SC", size: 21, color: "243247" } } },
      paragraphStyles: [
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: "Noto Sans CJK SC", size: 34, bold: true, color: "10233D" },
          paragraph: { spacing: { before: 280, after: 220 }, outlineLevel: 0 },
        },
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: "Noto Sans CJK SC", size: 28, bold: true, color: "176B75" },
          paragraph: { spacing: { before: 240, after: 140 }, outlineLevel: 1 },
        },
        {
          id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: "Noto Sans CJK SC", size: 24, bold: true, color: "344B68" },
          paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2 },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1180, right: 1440, bottom: 1180, left: 1440 },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `${report.subjectLabel} · 研究参考  |  `, color: "718096", size: 17 }),
              new TextRun({ children: [PageNumber.CURRENT], color: "718096", size: 17 }),
            ],
          })],
        }),
      },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

function markdownToDocx(markdown: string): Array<Paragraph | Table> {
  return markdown.split("\n").map((line) => {
    if (line.startsWith("# ")) return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(line.slice(2))] });
    if (line.startsWith("## ")) return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(line.slice(3))] });
    if (line.startsWith("### ")) return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(line.slice(4))] });
    if (/^[-*]\s/.test(line)) {
      return new Paragraph({
        numbering: { reference: "report-bullets", level: 0 },
        spacing: { after: 70 },
        children: [new TextRun(line.slice(2))],
      });
    }
    if (line.startsWith("> ")) {
      return new Paragraph({
        border: { left: { style: BorderStyle.SINGLE, size: 8, color: "2A9D9A", space: 8 } },
        spacing: { before: 100, after: 160 },
        indent: { left: 240 },
        children: [new TextRun({ text: line.slice(2), italics: true, color: "476174" })],
      });
    }
    return new Paragraph({
      spacing: { after: line.trim() ? 110 : 40, line: 330 },
      children: line.trim() ? [new TextRun(line)] : [],
    });
  });
}

async function createPdf(report: StoredResearchDocument) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontPath = path.join(
    process.cwd(),
    "node_modules/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2",
  );
  const fontBytes = await readFile(fontPath);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  pdf.setTitle(report.title);
  pdf.setAuthor("A 股产业链研究工作台");
  pdf.setSubject(report.executiveSummary);

  const state = { page: addPdfPage(pdf), y: 792 };
  for (const line of report.markdown.split("\n")) {
    const kind = line.startsWith("# ") ? "h1" : line.startsWith("## ") ? "h2" : line.startsWith("### ") ? "h3" : line.startsWith("- ") ? "bullet" : line.startsWith("> ") ? "quote" : "body";
    const text = line.replace(/^#{1,3}\s|^[-*>]\s/, "").trim();
    if (!text) {
      state.y -= 7;
      continue;
    }
    const size = kind === "h1" ? 20 : kind === "h2" ? 14 : kind === "h3" ? 11.5 : 9.2;
    const color = kind === "h1" ? rgb(.04, .13, .23) : kind === "h2" ? rgb(.06, .4, .43) : kind === "quote" ? rgb(.28, .38, .46) : rgb(.13, .19, .27);
    const prefix = kind === "bullet" ? "· " : "";
    const lines = wrapPdfText(`${prefix}${text}`, font, size, kind === "quote" ? 470 : 500);
    const lineHeight = size * 1.6;
    const before = kind === "h1" ? 12 : kind === "h2" ? 10 : kind === "h3" ? 7 : 2;
    ensurePdfSpace(pdf, state, lines.length * lineHeight + before + 8);
    state.y -= before;
    for (const wrapped of lines) {
      state.page.drawText(wrapped, { x: kind === "quote" ? 58 : 48, y: state.y, size, font, color });
      state.y -= lineHeight;
    }
    state.y -= kind.startsWith("h") ? 5 : 3;
  }

  for (const chart of report.charts) {
    ensurePdfSpace(pdf, state, 86 + chart.rows.length * 18);
    state.y -= 10;
    state.page.drawText(chart.title, { x: 48, y: state.y, size: 13, font, color: rgb(.06, .4, .43) });
    state.y -= 24;
    const maxValue = Math.max(1, ...chart.rows.map((row) => typeof row.value === "number" ? row.value : 0));
    for (const row of chart.rows) {
      const label = truncatePdfText(row.label, font, 8.5, 125);
      state.page.drawText(label, { x: 48, y: state.y, size: 8.5, font, color: rgb(.2, .28, .38) });
      if (typeof row.value === "number") {
        state.page.drawRectangle({ x: 180, y: state.y - 1, width: 260 * row.value / maxValue, height: 8, color: rgb(.18, .65, .63) });
      }
      state.page.drawText(`${row.value}${chart.unit}`, { x: 455, y: state.y, size: 8.5, font, color: rgb(.2, .28, .38) });
      state.y -= 18;
    }
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    page.drawLine({ start: { x: 48, y: 34 }, end: { x: 547, y: 34 }, thickness: .5, color: rgb(.78, .82, .87) });
    page.drawText(`${report.subjectLabel} · 仅供研究参考`, { x: 48, y: 20, size: 7.5, font, color: rgb(.42, .48, .56) });
    page.drawText(`${index + 1} / ${pages.length}`, { x: 510, y: 20, size: 7.5, font, color: rgb(.42, .48, .56) });
  });
  return pdf.save();
}

function addPdfPage(pdf: PDFDocument) {
  return pdf.addPage([595.28, 841.89]);
}

function ensurePdfSpace(pdf: PDFDocument, state: { page: PDFPage; y: number }, required: number) {
  if (state.y - required > 48) return;
  state.page = addPdfPage(pdf);
  state.y = 792;
}

function wrapPdfText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  for (const character of text) {
    const candidate = current + character;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function truncatePdfText(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let output = text;
  while (output && font.widthOfTextAtSize(`${output}…`, size) > maxWidth) output = output.slice(0, -1);
  return `${output}…`;
}
