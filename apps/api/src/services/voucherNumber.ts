import { prisma } from "../db";

/** Same atomic-counter pattern as serialNumber.service.ts, reused for voucher numbering. */
export async function nextVoucherNumber(prefix: string, width = 6): Promise<string> {
  const rows = await prisma.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "SerialSequence" ("bucketKey", "lastValue")
    VALUES (${prefix}, 1)
    ON CONFLICT ("bucketKey")
    DO UPDATE SET "lastValue" = "SerialSequence"."lastValue" + 1
    RETURNING "lastValue"
  `;
  return `${prefix}-${String(rows[0].lastValue).padStart(width, "0")}`;
}
