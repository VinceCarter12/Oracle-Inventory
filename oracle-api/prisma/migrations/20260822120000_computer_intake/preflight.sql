-- Read-only Phase 1 preflight. Review/export this report before migration.
-- It intentionally performs no automatic normalization, merge, delete, or rewrite.
SELECT lower(btrim("assetTag")) AS normalized_asset_tag,
       count(*) AS duplicate_count,
       array_agg("id" ORDER BY "createdAt") AS asset_ids
FROM "Asset"
WHERE "assetTag" IS NOT NULL AND btrim("assetTag") <> ''
GROUP BY lower(btrim("assetTag"))
HAVING count(*) > 1
ORDER BY normalized_asset_tag;

-- Expected result before applying migration: zero rows.
-- If rows remain, resolve them manually and retain an auditable decision record.
