-- Explicit gram weight for a stone/flat item. When set it overrides the
-- carat×0.2 conversion for the job card's gross weight (used by "Other Flat
-- Items" where the item can carry its own weight, independent of carat).
ALTER TABLE "ProdStoneEntry" ADD COLUMN "weightG" DECIMAL(12,3);
