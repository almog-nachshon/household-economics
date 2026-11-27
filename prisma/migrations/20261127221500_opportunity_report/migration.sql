-- Adds immutable research snapshots without altering existing financial data.
CREATE TABLE "OpportunityReport" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "reportId" TEXT NOT NULL,
  "researchDate" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "OpportunityReport_reportId_key" ON "OpportunityReport"("reportId");
CREATE INDEX "OpportunityReport_researchDate_idx" ON "OpportunityReport"("researchDate");
