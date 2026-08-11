import { TDocumentDefinitions } from "pdfmake/interfaces";
import { Order, Estimate, EstimateLine, Product, Karat, StoneType, Customer } from "@prisma/client";
import { formatINR } from "@jms/shared";

const fonts = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

// See pdf.service.ts for why this is typed by hand against the installed
// (server-side, 0.2.x) pdfmake build rather than the mismatched @types/pdfmake.
interface PdfKitDocument extends NodeJS.ReadableStream {
  end(): void;
}
interface PdfPrinterInstance {
  createPdfKitDocument(docDefinition: TDocumentDefinitions): PdfKitDocument;
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require("pdfmake") as new (fontDescriptors: typeof fonts) => PdfPrinterInstance;

const printer = new PdfPrinter(fonts);

type OrderWithRelations = Order & {
  product: Product;
  customer: Customer;
  estimate: Estimate & {
    lines: (EstimateLine & { purity?: Karat | null; stoneType?: StoneType | null })[];
  };
};

export async function generateOrderInvoicePdf(order: OrderWithRelations): Promise<Buffer> {
  const estimate = order.estimate;

  const tableBody: any[][] = [
    [
      { text: "Item/Head", style: "tableHeader" },
      { text: "Description", style: "tableHeader" },
      { text: "Qty", style: "tableHeader", alignment: "right" },
      { text: "Rate", style: "tableHeader", alignment: "right" },
      { text: "Amount", style: "tableHeader", alignment: "right" },
    ],
  ];

  if (!estimate.showBreakdownOnPdf) {
    const preGstAmount = Number(estimate.cost) + Number(estimate.profit);
    tableBody.push([
      "Jewellery",
      `${order.product.designName} (S/N: ${order.product.serialNo})`,
      { text: "1", alignment: "right" },
      { text: formatINR(preGstAmount), alignment: "right" },
      { text: formatINR(preGstAmount), alignment: "right" },
    ]);
  } else {
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
    tableBody.push([
      { colSpan: 4, text: "Subtotal", alignment: "right", bold: true },
      {}, {}, {},
      { text: formatINR(Number(estimate.cost)), alignment: "right", bold: true },
    ]);
    if (Number(estimate.profit) > 0) {
      tableBody.push([
        { colSpan: 4, text: `Profit Margin (${Number(estimate.profitPct)}%)`, alignment: "right" },
        {}, {}, {},
        { text: formatINR(Number(estimate.profit)), alignment: "right" },
      ]);
    }
  }

  if (Number(estimate.gstPct) > 0) {
    tableBody.push([
      { colSpan: 4, text: `GST (${Number(estimate.gstPct)}%)`, alignment: "right" },
      {}, {}, {},
      { text: formatINR(Number(estimate.gstAmount)), alignment: "right" },
    ]);
  }

  tableBody.push([
    { colSpan: 4, text: "Grand Total", alignment: "right", bold: true, fillColor: "#f3f4f6" },
    {}, {}, {},
    { text: formatINR(Number(order.approvedAmount)), alignment: "right", bold: true, fillColor: "#f3f4f6" },
  ]);

  const balanceDue = Number(order.approvedAmount) - Number(order.advanceReceived);

  const docDefinition: TDocumentDefinitions = {
    defaultStyle: { font: "Helvetica", fontSize: 10 },
    content: [
      {
        columns: [
          { text: "YOUR JEWELLERY BRAND", fontSize: 20, bold: true, color: "#d4af37" },
          { text: "TAX INVOICE", fontSize: 16, bold: true, alignment: "right", color: "#6b7280" },
        ],
      },
      { canvas: [{ type: "line", x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: "#e5e7eb" }] },
      { text: "\n" },
      {
        columns: [
          {
            width: "50%",
            text: [{ text: "Bill To:\n", bold: true }, order.customer.name],
          },
          {
            width: "50%",
            alignment: "right",
            text: [
              { text: "Invoice Date: ", bold: true }, new Date(order.createdAt).toLocaleDateString(), "\n",
              { text: "Order No: ", bold: true }, order.orderNo, "\n",
              { text: "Design: ", bold: true }, order.product.designName, "\n",
            ],
          },
        ],
      },
      { text: "\n\n" },
      {
        table: { headerRows: 1, widths: ["20%", "35%", "15%", "15%", "15%"], body: tableBody },
        layout: "lightHorizontalLines",
      },
      { text: "\n\n" },
      {
        table: {
          widths: ["70%", "30%"],
          body: [
            [{ text: "Advance Received", alignment: "right" }, { text: formatINR(Number(order.advanceReceived)), alignment: "right" }],
            [
              { text: "Balance Due", alignment: "right", bold: true, fillColor: "#FFF3DA" },
              { text: formatINR(balanceDue), alignment: "right", bold: true, fillColor: "#FFF3DA" },
            ],
          ],
        },
        layout: "noBorders",
      },
      { text: "\n\n\n" },
      { text: "Terms & Conditions", bold: true, fontSize: 9 },
      {
        text: "1. Goods once sold will only be exchanged as per store policy.\n2. Balance due at the time of delivery.",
        fontSize: 8,
        color: "#6b7280",
      },
    ],
    styles: {
      tableHeader: { bold: true, color: "#374151" },
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
