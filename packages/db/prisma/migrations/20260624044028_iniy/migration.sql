/*
  Warnings:

  - A unique constraint covering the columns `[tool_name]` on the table `Policy` will be added. If there are existing duplicate values, this will fail.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "budget_limit" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Conversation" ("budget_limit", "createdAt", "id", "tokens_used") SELECT "budget_limit", "createdAt", "id", "tokens_used" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Policy_tool_name_key" ON "Policy"("tool_name");
