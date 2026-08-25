# Phase 5 migration runbook

Back up first and verify Phase 3 networking and Phase 4 secret-reference tables exist. Preflight duplicate server/firewall profiles and overlapping role/equipment/address history before applying. Test in staging with feature disabled, then enable only after RBAC and redacted audit checks. There is no automatic down migration; restore from backup or use an approved forward fix. No credentials, firewall rules, VPN keys, PPPoE passwords, or raw configuration are stored.
