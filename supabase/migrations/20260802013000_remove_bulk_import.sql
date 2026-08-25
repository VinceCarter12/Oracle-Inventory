-- Bulk import removal for future databases only. Do not apply to the current test project.
-- Existing Asset records are preserved; only their import provenance is removed.

DELETE FROM "UserPermission"
WHERE "permissionId" IN ('perm-import-inventory', 'perm-force-import');

DELETE FROM "RolePermission"
WHERE "permissionId" IN ('perm-import-inventory', 'perm-force-import');

DELETE FROM "Permission"
WHERE "id" IN ('perm-import-inventory', 'perm-force-import');

ALTER TABLE "Asset" DROP CONSTRAINT "Asset_importId_fkey";
ALTER TABLE "Asset" DROP COLUMN "importId";

DROP TABLE "ImportRow";
DROP TABLE "ColumnMappingPreset";
DROP TABLE "ImportHistory";

DROP TYPE "ImportStatus";
DROP TYPE "RowOutcome";
