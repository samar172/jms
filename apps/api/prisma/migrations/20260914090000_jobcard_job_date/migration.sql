-- Actual work date for a job card, separate from the immutable createdAt entry
-- timestamp. Nullable; existing rows fall back to createdAt when read.
ALTER TABLE "ProdJobCard" ADD COLUMN "jobDate" TIMESTAMP(3);
