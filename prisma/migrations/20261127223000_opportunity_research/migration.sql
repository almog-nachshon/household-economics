CREATE TABLE "OpportunityResearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemaVersion" TEXT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "screenedCount" INTEGER NOT NULL,
    "reportCount" INTEGER NOT NULL,
    "payload" TEXT NOT NULL
);

CREATE INDEX "OpportunityResearch_asOf_importedAt_idx" ON "OpportunityResearch"("asOf", "importedAt");
