-- CreateTable
CREATE TABLE "Newsletter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceFile" TEXT NOT NULL,
    "documentTitle" TEXT,
    "newsletterType" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "verification" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
