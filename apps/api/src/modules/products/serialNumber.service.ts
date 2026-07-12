import { prisma } from "../../db";
import { formatSerialNumber } from "@jms/shared";

function currentYYMM(): string {
  const now = new Date();
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yy}${mm}`;
}

/**
 * Atomically allocates the next sequence number for a (category, purity, month)
 * bucket via a single INSERT ... ON CONFLICT ... RETURNING statement, so that
 * concurrent product creation can never produce a duplicate or skipped serial
 * number (FR-2.03) — Postgres guarantees this INSERT is a single atomic
 * row-level operation, unlike a Prisma-level read-then-write upsert.
 */
async function nextSequence(bucketKey: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "SerialSequence" ("bucketKey", "lastValue")
    VALUES (${bucketKey}, 1)
    ON CONFLICT ("bucketKey")
    DO UPDATE SET "lastValue" = "SerialSequence"."lastValue" + 1
    RETURNING "lastValue"
  `;
  return rows[0].lastValue;
}

export async function generateSerialNumber(categoryCode: string, purityCode: string) {
  const yymm = currentYYMM();
  const bucketKey = `${categoryCode}-${purityCode}-${yymm}`;
  const sequence = await nextSequence(bucketKey);
  return formatSerialNumber({ categoryCode, purityCode, yymm, sequence });
}
