-- Kundan sits between Jadai (2) and Setting: shift Setting/Fitting down, then
-- insert a Kundan stage (Pending) into every existing job card that lacks one.
UPDATE "ProdStage" SET "sequenceOrder" = 5 WHERE "stageName" = 'Fitting';
UPDATE "ProdStage" SET "sequenceOrder" = 4 WHERE "stageName" = 'Setting';

INSERT INTO "ProdStage" (id, "jobCardId", "stageName", status, "sequenceOrder")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || jc.id), 1, 24),
       jc.id, 'Kundan', 'Pending', 3
FROM "ProdJobCard" jc
WHERE NOT EXISTS (
  SELECT 1 FROM "ProdStage" s WHERE s."jobCardId" = jc.id AND s."stageName" = 'Kundan'
);
