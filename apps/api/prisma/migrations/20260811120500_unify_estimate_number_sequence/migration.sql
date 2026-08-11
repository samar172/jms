-- Estimate numbers used to switch prefix by document type (QT- for Rough
-- Estimate, FC- for Final Costing), which read as two unrelated documents
-- when they're really just versions of the same estimate. New numbers are
-- now plain digits from a single shared "ESTIMATE" counter. Seed it to
-- continue after the highest QT/FC number already issued, instead of
-- restarting at 1 alongside numbers like FC-000013 that are still on screen.
INSERT INTO "SerialSequence" ("bucketKey", "lastValue")
SELECT 'ESTIMATE', COALESCE((SELECT MAX("lastValue") FROM "SerialSequence" WHERE "bucketKey" IN ('QT', 'FC')), 0)
ON CONFLICT ("bucketKey") DO NOTHING;
