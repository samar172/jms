-- Per-karigar piece count on an assignment (e.g. Jadai). Previously the Jadai
-- output overwrote the job-card-level pieceCount, so multiple karigars on the
-- same stage clobbered each other's counts.
ALTER TABLE "ProdAssignment" ADD COLUMN "pieceCount" INTEGER;
