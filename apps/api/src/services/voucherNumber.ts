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

/**
 * Same atomic counter, but no prefix/dash — for document numbers that are
 * plain digits (e.g. Estimate numbers, which stay one flat series across
 * Rough Estimate / Final Costing / versions rather than switching prefix by
 * type).
 */
export async function nextSequenceNumber(bucketKey: string, width = 6): Promise<string> {
  const rows = await prisma.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "SerialSequence" ("bucketKey", "lastValue")
    VALUES (${bucketKey}, 1)
    ON CONFLICT ("bucketKey")
    DO UPDATE SET "lastValue" = "SerialSequence"."lastValue" + 1
    RETURNING "lastValue"
  `;
  return String(rows[0].lastValue).padStart(width, "0");
}
