-- Phase 5 forward-only hardening.
-- Preflight existing CircuitEquipmentAssignment rows before applying; NULL/false is the safe default.
ALTER TABLE "CircuitEquipmentAssignment" ADD COLUMN "sharedServiceApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CircuitEquipmentAssignment" ADD COLUMN "sharedServiceReason" TEXT;

-- PostgreSQL exclusion constraints are intentionally not applied here because existing deployments may
-- not have btree_gist installed. The API uses a serializable transaction and overlap predicate; operators
-- may add an exclusion constraint after reviewing existing rows:
-- CREATE EXTENSION IF NOT EXISTS btree_gist;
-- ALTER TABLE "IspCircuitAddress" ADD CONSTRAINT "IspCircuitAddress_no_overlap"
-- EXCLUDE USING gist ("circuitId" WITH =, tstzrange("validFrom", COALESCE("validTo", 'infinity'::timestamp), '[)') WITH &&);
