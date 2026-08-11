-- Estimate.karigarId was a vestigial single-karigar field from before
-- per-stage karigar assignment (JobStage.karigarId) existed. It was never
-- read anywhere besides the estimate detail screen, and having two separate
-- "assign a karigar" controls (one on the estimate, one per job-card stage)
-- was confusing since only the job-card one actually drives Pull Labour.
ALTER TABLE "Estimate" DROP CONSTRAINT IF EXISTS "Estimate_karigarId_fkey";
DROP INDEX IF EXISTS "Estimate_karigarId_idx";
ALTER TABLE "Estimate" DROP COLUMN "karigarId";
