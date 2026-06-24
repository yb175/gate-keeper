/*
  Warnings:

  - You are about to drop the column `token_limit` on the `Policy` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokens_used" INTEGER NOT NULL,
    "budget_limit" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Policy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tool_name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "sandbox_path" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Policy" ("action", "createdAt", "id", "sandbox_path", "tool_name", "updatedAt") SELECT "action", "createdAt", "id", "sandbox_path", "tool_name", "updatedAt" FROM "Policy";
DROP TABLE "Policy";
ALTER TABLE "new_Policy" RENAME TO "Policy";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
