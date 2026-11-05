ALTER TABLE "AnalysisVersion" ADD COLUMN "operationId" TEXT;
CREATE UNIQUE INDEX "AnalysisVersion_operationId_key" ON "AnalysisVersion"("operationId");
