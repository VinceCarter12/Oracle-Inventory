# Integration-test gap

The branch rollout route requires authenticated Super Admin requests and a live database to verify the database-backed stale-write race. Local validation covers the pure stale-write helper and route compilation. Run the authenticated route matrix in staging after applying the additive migration: first create without a version, update with the returned branch-row `updatedAt`, and verify an old version returns `409 STALE_WRITE`.
