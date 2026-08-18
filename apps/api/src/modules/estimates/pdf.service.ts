import { TDocumentDefinitions } from "pdfmake/interfaces";
import { Estimate, EstimateLine, Product, PurityTier, StoneType, Customer } from "@prisma/client";
import { formatINR, round2 } from "@jms/shared";

const fonts = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

// @types/pdfmake (0.3.x) types the newer browser-style createPdf() API, but
// the installed pdfmake package (0.2.x) is the older server-side build that
// exports a constructable PdfPrinter class instead — the two don't line up,
// so this is typed by hand against what's actually installed rather than
// fighting the mismatched .d.ts.
interface PdfKitDocument extends NodeJS.ReadableStream {
  end(): void;
}
interface PdfPrinterInstance {
  createPdfKitDocument(docDefinition: TDocumentDefinitions): PdfKitDocument;
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require("pdfmake") as new (fontDescriptors: typeof fonts) => PdfPrinterInstance;

const printer = new PdfPrinter(fonts);

type EstimateWithRelations = Estimate & {
  product: Product;
  customer?: Customer | null;
  lines: (EstimateLine & { purity?: PurityTier | null; stoneType?: StoneType | null })[];
};

export async function generateEstimatePdf(estimate: EstimateWithRelations): Promise<Buffer> {
  const isFinal = estimate.type === "FINAL_COSTING";
  
  // Format the lines into a table body
  const tableBody: any[][] = [
    [
      { text: "Item/Head", style: "tableHeader" },
      { text: "Description", style: "tableHeader" },
      { text: "Qty", style: "tableHeader", alignment: "right" },
      { text: "Rate", style: "tableHeader", alignment: "right" },
      { text: "Amount", style: "tableHeader", alignment: "right" },
    ],
  ];

  for (const line of estimate.lines) {
    let desc = line.description || "";
    if (line.purity) desc += ` (${line.purity.code})`;
    if (line.stoneType) desc += ` (${line.stoneType.name})`;

    tableBody.push([
      line.head.replace(/_/g, " "),
      desc,
      { text: Number(line.quantity).toString(), alignment: "right" },
      { text: formatINR(Number(line.rate)), alignment: "right" },
      { text: formatINR(Number(line.amount)), alignment: "right" },
    ]);
  }

  // If breakdown is hidden, we just show one line for the total piece
  // (pre-GST — GST and Grand Total rows are appended below, same as the itemised view).
  if (!estimate.showBreakdownOnPdf) {
    tableBody.length = 1; // Clear out the detail lines
    const preGstAmount = Number(estimate.cost) + Number(estimate.profit);
    tableBody.push([
      "Jewellery",
      `${estimate.product.designName} (S/N: ${estimate.product.serialNo})`,
      { text: "1", alignment: "right" },
      { text: formatINR(preGstAmount), alignment: "right" },
      { text: formatINR(preGstAmount), alignment: "right" },
    ]);
  } else {
    // Add totals at the bottom of the table
    tableBody.push([
      { colSpan: 4, text: "Subtotal", alignment: "right", bold: true },
      {}, {}, {},
      { text: formatINR(Number(estimate.cost)), alignment: "right", bold: true }
    ]);
    if (Number(estimate.profit) > 0) {
      tableBody.push([
        { colSpan: 4, text: `Profit Margin (${Number(estimate.profitPct)}%)`, alignment: "right" },
        {}, {}, {},
        { text: formatINR(Number(estimate.profit)), alignment: "right" }
      ]);
    }
  }

  // GST — shown as CGST + SGST split evenly, the conventional line-item
  // format for an intra-state sale, rather than one combined GST row. Total
  // tax is identical either way; CGST is rounded and SGST takes the
  // remainder so the two always sum back to the exact gstAmount.
  if (Number(estimate.gstPct) > 0) {
    const halfPct = Number(estimate.gstPct) / 2;
    const cgstAmount = round2(Number(estimate.gstAmount) / 2);
    const sgstAmount = round2(Number(estimate.gstAmount) - cgstAmount);
    tableBody.push([
      { colSpan: 4, text: `CGST (${halfPct}%)`, alignment: "right" },
      {}, {}, {},
      { text: formatINR(cgstAmount), alignment: "right" }
    ]);
    tableBody.push([
      { colSpan: 4, text: `SGST (${halfPct}%)`, alignment: "right" },
      {}, {}, {},
      { text: formatINR(sgstAmount), alignment: "right" }
    ]);
  }

  // Grand Total Row
  tableBody.push([
    { colSpan: 4, text: "Grand Total", alignment: "right", bold: true, fillColor: "#f3f4f6" },
    {}, {}, {},
    { text: formatINR(Number(estimate.netAmount)), alignment: "right", bold: true, fillColor: "#f3f4f6" }
  ]);

  const docDefinition: TDocumentDefinitions = {
    defaultStyle: { font: "Helvetica", fontSize: 10 },
    content: [
      {
        columns: [
          {
            text: "YOUR JEWELLERY BRAND",
            fontSize: 20,
            bold: true,
            color: "#d4af37", // Gold color
          },
          {
            text: isFinal ? "INVOICE / FINAL COSTING" : "QUOTATION",
            fontSize: 16,
            bold: true,
            alignment: "right",
            color: "#6b7280",
          }
        ]
      },
      {
        canvas: [{ type: "line", x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: "#e5e7eb" }]
      },
      { text: "\n" },
      {
        columns: [
          {
            width: "50%",
            text: [
              { text: "Bill To:\n", bold: true },
              estimate.customer ? estimate.customer.name : "Walk-in Customer",
            ]
          },
          {
            width: "50%",
            alignment: "right",
            text: [
              { text: "Date: ", bold: true }, estimate.estimateDate.toLocaleDateString(), "\n",
              { text: "Estimate No: ", bold: true }, `EST-${estimate.product.serialNo}-${estimate.version}`, "\n",
              { text: "Design: ", bold: true }, estimate.product.designName, "\n"
            ]
          }
        ]
      },
      { text: "\n\n" },
      {
        table: {
          headerRows: 1,
          widths: ["20%", "35%", "15%", "15%", "15%"],
          body: tableBody
        },
        layout: "lightHorizontalLines"
      },
      { text: "\n\n\n" },
      {
        text: "Terms & Conditions",
        bold: true,
        fontSize: 9
      },
      {
        text: "1. Quotation is valid for 7 days, subject to gold rate fluctuations.\n2. 50% advance required to initiate production.",
        fontSize: 8,
        color: "#6b7280"
      }
    ],
    styles: {
      tableHeader: {
        bold: true,
        color: "#374151"
      }
    }
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
