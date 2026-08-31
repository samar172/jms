-- Persist a free-text label on a material issue line. Used to remember the
-- Fitting finding type (Wire / Push Cap / Clip Cap …) so it survives an edit
-- instead of collapsing to a generic "Finding".
ALTER TABLE "ProdMaterialIssue" ADD COLUMN "label" TEXT;
