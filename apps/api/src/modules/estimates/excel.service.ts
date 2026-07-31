import ExcelJS from "exceljs";
import { Estimate, EstimateLine, Product, Karat, StoneType, Customer } from "@prisma/client";
import { formatINR } from "@jms/shared";

type EstimateWithRelations = Estimate & {
  product: Product & { customer?: Customer | null };
  lines: (EstimateLine & { purity?: Karat | null; stoneType?: StoneType | null })[];
};

export async function generateEstimateExcel(estimate: EstimateWithRelations): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JMS System";
  workbook.lastModifiedBy = "JMS System";
  workbook.created = new Date();
  
  const sheet = workbook.addWorksheet("Estimate", {
    pageSetup: { paperSize: 9, orientation: "portrait" },
  });

  // Columns definition
  sheet.columns = [
    { header: "Item/Head", key: "head", width: 25 },
    { header: "Description", key: "description", width: 40 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Rate", key: "rate", width: 15 },
    { header: "Amount", key: "amount", width: 20 },
  ];

  // Header styles
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
  sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };

  const isFinal = estimate.type === "FINAL_COSTING";

  // Pre-insert some header rows above the table
  sheet.spliceRows(1, 0, 
    ["YOUR JEWELLERY BRAND", "", "", "", isFinal ? "INVOICE / FINAL COSTING" : "QUOTATION"],
    [],
    [`Bill To: ${estimate.product.customer ? estimate.product.customer.name : "Walk-in Customer"}`, "", "", "", `Date: ${estimate.estimateDate.toLocaleDateString()}`],
    [`Design: ${estimate.product.designName}`, "", "", "", `Estimate No: EST-${estimate.product.serialNo}-${estimate.version}`],
    []
  );

  sheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FFD4AF37" } };
  sheet.getCell("E1").font = { bold: true, size: 14, color: { argb: "FF6B7280" } };
  sheet.getCell("E1").alignment = { horizontal: "right" };
  sheet.getRow(3).font = { bold: true };
  sheet.getRow(4).font = { bold: true };
  sheet.getCell("E3").alignment = { horizontal: "right" };
  sheet.getCell("E4").alignment = { horizontal: "right" };

  // Re-apply header styling for the actual table header which is now on row 6
  sheet.getRow(6).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };

  if (!estimate.showBreakdownOnPdf) {
    sheet.addRow({
      head: "Jewellery",
      description: `${estimate.product.designName} (S/N: ${estimate.product.serialNo})`,
      qty: 1,
      rate: Number(estimate.netAmount),
      amount: Number(estimate.netAmount),
    });
  } else {
    for (const line of estimate.lines) {
      let desc = line.description || "";
      if (line.purity) desc += ` (${line.purity.code})`;
      if (line.stoneType) desc += ` (${line.stoneType.name})`;

      sheet.addRow({
        head: line.head.replace(/_/g, " "),
        description: desc,
        qty: Number(line.quantity),
        rate: Number(line.rate),
        amount: Number(line.amount),
      });
    }

    sheet.addRow([]);
    const subtotalRow = sheet.addRow({ description: "Subtotal", amount: Number(estimate.cost) });
    subtotalRow.font = { bold: true };
    subtotalRow.getCell("description").alignment = { horizontal: "right" };

    if (Number(estimate.profit) > 0) {
      const profitRow = sheet.addRow({ description: `Profit Margin (${Number(estimate.profitPct)}%)`, amount: Number(estimate.profit) });
      profitRow.getCell("description").alignment = { horizontal: "right" };
    }
  }

  if (estimate.gstPct && Number(estimate.gstPct) > 0) {
    const netBeforeGst = Number(estimate.cost) + Number(estimate.profit);
    const gstAmount = netBeforeGst * (Number(estimate.gstPct) / 100);
    const gstRow = sheet.addRow({ description: `GST (${Number(estimate.gstPct)}%)`, amount: gstAmount });
    gstRow.getCell("description").alignment = { horizontal: "right" };
  }

  const totalRow = sheet.addRow({ description: "Grand Total", amount: Number(estimate.netAmount) });
  totalRow.font = { bold: true };
  totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  totalRow.getCell("description").alignment = { horizontal: "right" };

  // Number formatting
  sheet.getColumn("rate").numFmt = "₹#,##0.00";
  sheet.getColumn("amount").numFmt = "₹#,##0.00";

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
