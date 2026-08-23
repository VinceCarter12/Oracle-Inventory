-- Phase 5 explicit shared/global circuit eligibility. Default false is fail-closed.
ALTER TABLE "IspCircuit" ADD COLUMN "isSharedService" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "IspCircuit" ADD COLUMN "sharedServiceReason" TEXT;
