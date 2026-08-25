# Belarc proposal hardening

Additive proposal metadata only. Keep proposal capability disabled until licensing and retention are explicitly approved. Existing `HardwareScan` baseline and legacy raw HTML compatibility remain unchanged. Apply only after backup and migration parity review; rollback is feature-off or a reviewed forward-fix, not an automatic down migration.

Preflight duplicate baselines first: `SELECT "assetId", COUNT(*) FROM "HardwareScan" WHERE "isBaseline" = true GROUP BY "assetId" HAVING COUNT(*) > 1;`. The migration aborts when duplicates exist, then adds a partial unique index enforcing one baseline per asset.

Retention modes are explicit: `redacted_only` stores no raw HTML and disables the raw endpoint. `encrypted_limited` requires `BELARC_RETENTION_KEY` as a 32-byte hex/base64 key and stores AES-256-GCM ciphertext, IV, and authentication tag only. Never log or commit the key.

Encrypted evidence requires a positive `BELARC_RETENTION_DAYS` value; missing/invalid duration disables storage. Expired evidence is blocked before decryption and listed by `GET /api/hardware-audit/expired-evidence` for operator action. It may be purged only through the authenticated Super Admin purge endpoint with explicit confirmation and reason. Purge clears ciphertext/IV/tag, records `purgedAt`, and writes only redacted audit metadata; it is not an automatic delete job.
