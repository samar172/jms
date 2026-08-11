-- JobCard was scoped only to Product (the design), so two customers
-- re-estimating the same design ended up sharing one job card's karigar
-- assignments/material issues, and Pull Labour on one customer's estimate
-- picked up another customer's labour entries for the same product. Scope
-- production runs to the specific Estimate instead — Product is a reusable
-- design/catalog item, not a one-buyer-at-a-time physical piece.
ALTER TABLE "JobCard" ADD COLUMN "estimateId" TEXT;
CREATE INDEX "JobCard_estimateId_idx" ON "JobCard"("estimateId");
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
