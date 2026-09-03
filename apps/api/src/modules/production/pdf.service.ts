import { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import { formatINR } from "@jms/shared";
import type { MetalLine, StoneLine, LabourLine } from "@jms/shared";

const fonts = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

// See apps/api/src/modules/estimates/pdf.service.ts for why this is hand-typed
// against the installed pdfmake (0.2.x, server-side PdfPrinter) rather than
// the mismatched @types/pdfmake (0.3.x, browser createPdf()) — don't "fix"
// this back to `import PdfPrinter from "pdfmake"`, it breaks the build.
interface PdfKitDocument extends NodeJS.ReadableStream {
  end(): void;
}
interface PdfPrinterInstance {
  createPdfKitDocument(docDefinition: TDocumentDefinitions): PdfKitDocument;
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require("pdfmake") as new (fontDescriptors: typeof fonts) => PdfPrinterInstance;
const printer = new PdfPrinter(fonts);

export interface JobCardPdfInput {
  jobNo: string;
  itemName: string;
  category: string;
  designCode: string | null;
  createdAt: string;
  targetPurity: string;
  pieceCount: number | null;
  imageDataUri: string | null;
  metal: MetalLine[];
  stones: StoneLine[];
  labour: LabourLine[];
  totals: {
    grossWeight: number;
    pureEq: number;
    silverValue: number;
    stonesConsumed: number;
    labour: number;
    estimatedCostToDate: number;
  };
  profitPct: number;
}

const th = (text: string, alignment: "left" | "right" = "left") => ({ text, style: "th", alignment });
const td = (text: string | number, alignment: "left" | "right" = "left") => ({ text: String(text), style: "td", alignment });

export async function generateJobCardPdf(input: JobCardPdfInput): Promise<Buffer> {
  const totalPureMetal = +input.metal.reduce((s, m) => s + m.pureG, 0).toFixed(3);
  const totalMetalWeight = +input.metal.reduce((s, m) => s + m.weightG, 0).toFixed(3);
  const totalStonesAmount = input.stones.reduce((s, x) => s + x.valueIssued, 0);
  const totalLabourAmount = input.labour.reduce((s, x) => s + x.amount, 0);
  const totalAmt = input.totals.estimatedCostToDate;
  const grandTotal = +(totalAmt * (1 + input.profitPct / 100)).toFixed(2);

  const metalTable = {
    table: {
      headerRows: 1,
      widths: ["*", "auto", "auto", "auto"],
      body: [
        [th("Description"), th("Wt (gm)", "right"), th("Purity", "right"), th("Pure (gm)", "right")],
        ...input.metal.map((m) => [
          td(m.pieces != null ? `${m.name} (${m.pieces} pcs)` : m.name),
          td(m.weightG.toFixed(3), "right"),
          td(m.purity, "right"),
          td(m.pureG.toFixed(3), "right"),
        ]),
        [td("Total Pure Metal"), td(totalMetalWeight.toFixed(3), "right"), {}, td(totalPureMetal.toFixed(3), "right")],
      ],
    },
    layout: "lightHorizontalLines",
  };

  const stonesTable = {
    table: {
      headerRows: 1,
      widths: ["*", "auto", "auto", "auto"],
      body: [
        [th("Product"), th("Qty", "right"), th("Rate", "right"), th("Amount", "right")],
        ...(input.stones.length
          ? input.stones.map((s) => [td(s.type), td(s.qtyIssued || "—"), td(""), td(formatINR(s.valueIssued), "right")])
          : [[{ text: "No stones recorded", style: "td", colSpan: 4, alignment: "center" as const }, {}, {}, {}]]),
        [td("Total"), {}, {}, td(formatINR(totalStonesAmount), "right")],
      ],
    },
    layout: "lightHorizontalLines",
  };

  const labourTable = {
    table: {
      headerRows: 1,
      widths: ["*", "*", "auto", "auto"],
      body: [
        [th("Stage"), th("Karigar"), th("Basis"), th("Amount", "right")],
        ...(input.labour.length
          ? input.labour.map((l) => [td(l.stage), td(l.karigar), td(l.basis), td(formatINR(l.amount), "right")])
          : [[{ text: "No labour recorded", style: "td", colSpan: 4, alignment: "center" as const }, {}, {}, {}]]),
        [td("Total Labour"), {}, {}, td(formatINR(totalLabourAmount), "right")],
      ],
    },
    layout: "lightHorizontalLines",
  };

  const summaryTable = {
    table: {
      widths: ["*", "auto"],
      body: [
        ["Total Pure Metal Value", { text: formatINR(input.totals.silverValue), alignment: "right" as const }],
        ["Stones Consumed", { text: formatINR(input.totals.stonesConsumed), alignment: "right" as const }],
        ["Labour", { text: formatINR(input.totals.labour), alignment: "right" as const }],
        [{ text: "Total Amount", bold: true }, { text: formatINR(totalAmt), alignment: "right" as const, bold: true }],
        [`Profit % (${input.profitPct}%)`, { text: formatINR(grandTotal - totalAmt), alignment: "right" as const }],
        [{ text: "Grand Total", bold: true, fillColor: "#f3f4f6" }, { text: formatINR(grandTotal), alignment: "right" as const, bold: true, fillColor: "#f3f4f6" }],
      ],
    },
    layout: "lightHorizontalLines",
  };

  const headerColumns: Content[] = [
    {
      width: "*",
      stack: [
        { text: input.itemName, fontSize: 16, bold: true },
        { text: `${input.category}${input.designCode ? ` · ${input.designCode}` : ""}`, fontSize: 9, color: "#6b7280" },
        { text: "\n" },
        {
          columns: [
            { width: "auto", text: [{ text: "Job No: ", bold: true }, input.jobNo] },
            { width: "auto", text: [{ text: "  Date: ", bold: true }, input.createdAt] },
            { width: "auto", text: [{ text: "  Purity: ", bold: true }, input.targetPurity] },
            { width: "auto", text: [{ text: "  Pieces: ", bold: true }, String(input.pieceCount ?? "—")] },
          ],
          fontSize: 9,
        },
        { text: [{ text: "Gross Wt: ", bold: true }, `${input.totals.grossWeight.toFixed(3)} g`], fontSize: 9 },
      ],
    } as Content,
  ];
  if (input.imageDataUri) {
    headerColumns.push({ width: 90, image: input.imageDataUri, fit: [90, 90] } as Content);
  }

  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [30, 30, 30, 30],
    defaultStyle: { font: "Helvetica", fontSize: 9 },
    content: [
      { columns: headerColumns },
      { canvas: [{ type: "line", x1: 0, y1: 8, x2: 535, y2: 8, lineWidth: 1, lineColor: "#e5e7eb" }] },
      { text: "\n" },
      { text: "Metal", style: "sectionTitle" },
      metalTable,
      { text: "\n" },
      { text: "Raw Material (Stones)", style: "sectionTitle" },
      stonesTable,
      { text: "\n" },
      { text: "Labour", style: "sectionTitle" },
      labourTable,
      { text: "\n" },
      { text: "Summary", style: "sectionTitle" },
      { columns: [{ width: "*", text: "" }, { width: 260, table: summaryTable.table, layout: summaryTable.layout }] },
    ],
    styles: {
      sectionTitle: { bold: true, fontSize: 11, color: "#374151", margin: [0, 0, 0, 4] },
      th: { bold: true, fillColor: "#f3f4f6", color: "#374151" },
      td: {},
    },
  };

  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];
      pdfDoc.on("data", (chunk) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);
      pdfDoc.end();
    } catch (err) {
      reject(err);
    }
  });
}
