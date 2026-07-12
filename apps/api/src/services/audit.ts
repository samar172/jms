import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditAction } from "@prisma/client";

type TxClient = PrismaClient | Prisma.TransactionClient;

export async function recordAudit(
  db: TxClient,
  params: {
    userId: string | null;
    action: AuditAction;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    ipAddress?: string | null;
  }
) {
  await db.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeJson: params.before === undefined ? undefined : (params.before as Prisma.InputJsonValue),
      afterJson: params.after === undefined ? undefined : (params.after as Prisma.InputJsonValue),
      ipAddress: params.ipAddress ?? null,
    },
  });
}
