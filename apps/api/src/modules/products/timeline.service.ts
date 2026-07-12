import { prisma } from "../../db";

export interface TimelineEntry {
  type: string;
  timestamp: Date;
  description: string;
}

/** FR-2.10: complete history per serial number on a single timeline. */
export async function buildProductTimeline(productId: string): Promise<TimelineEntry[]> {
  const [jobCards, images, estimates] = await Promise.all([
    prisma.jobCard.findMany({
      where: { productId },
      include: {
        stages: {
          include: {
            processStage: true,
            karigar: true,
            materialIssues: true,
            materialReceipts: true,
            labourEntries: true,
            wastageRecord: true,
          },
        },
      },
    }),
    prisma.productImage.findMany({ where: { productId, isActive: true } }),
    prisma.estimate.findMany({ where: { productId } }),
  ]);

  const entries: TimelineEntry[] = [];

  for (const image of images) {
    entries.push({
      type: "IMAGE",
      timestamp: image.createdAt,
      description: `${image.type.replace(/_/g, " ")} image uploaded`,
    });
  }

  for (const estimate of estimates) {
    entries.push({
      type: "ESTIMATE",
      timestamp: estimate.createdAt,
      description: `${estimate.type.replace(/_/g, " ")} v${estimate.version} created (${estimate.status})`,
    });
    if (estimate.approvedAt) {
      entries.push({
        type: "ESTIMATE_APPROVED",
        timestamp: estimate.approvedAt,
        description: `Estimate v${estimate.version} approved`,
      });
    }
  }

  for (const jobCard of jobCards) {
    entries.push({
      type: "JOB_CARD",
      timestamp: jobCard.createdAt,
      description: `Job card created`,
    });
    for (const stage of jobCard.stages) {
      for (const issue of stage.materialIssues) {
        entries.push({
          type: "MATERIAL_ISSUE",
          timestamp: issue.issuedAt,
          description: `${issue.materialType} issued to karigar — ${issue.fineWeightG.toString()} g fine`,
        });
      }
      for (const receipt of stage.materialReceipts) {
        entries.push({
          type: "MATERIAL_RECEIPT",
          timestamp: receipt.receivedAt,
          description: `Material received — piece ${receipt.finishedPieceWeightG.toString()} g, dust ${receipt.dustWeightG.toString()} g`,
        });
      }
      for (const labour of stage.labourEntries) {
        entries.push({
          type: "LABOUR",
          timestamp: labour.enteredAt,
          description: `Labour booked — ${stage.processStage.name} — ₹${labour.amount.toString()}`,
        });
      }
      if (stage.wastageRecord) {
        const w = stage.wastageRecord;
        entries.push({
          type: "WASTAGE",
          timestamp: stage.wastageRecord.createdAt,
          description: `Wastage recorded — ${w.wastagePct.toString()}% (${
            w.withinTolerance ? "within tolerance" : "exception raised"
          })`,
        });
      }
    }
  }

  return entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
