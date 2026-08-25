-- Adds the unique replay key for circuit secret-reference links.
CREATE UNIQUE INDEX "IspCircuitSecretReference_idempotencyKey_key" ON "IspCircuitSecretReference"("idempotencyKey");
