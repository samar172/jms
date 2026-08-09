-- Version numbers were only unique per (productId, type), shared across every
-- customer quoted on that product. Two different customers both getting
-- estimate "v1" on the same design made independent quotes look like
-- revisions of a single lineage, and could even collide (both landing on the
-- same version number) once the API started counting versions per customer.
-- Scope the constraint to match.
DROP INDEX "Estimate_productId_type_version_key";

CREATE UNIQUE INDEX "Estimate_productId_type_customerId_version_key" ON "Estimate"("productId", "type", "customerId", "version");
