/*
  Warnings:

  - A unique constraint covering the columns `[provider,providerId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "DoseEvent_userId_plannedAt_idx";

-- DropIndex
DROP INDEX "DoseEvent_userId_updatedAt_idx";

-- DropIndex
DROP INDEX "Medication_userId_updatedAt_idx";

-- DropIndex
DROP INDEX "Schedule_userId_updatedAt_idx";

-- AlterTable
ALTER TABLE "Schedule" ALTER COLUMN "times" DROP DEFAULT,
ALTER COLUMN "daysOfWeek" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "providerId" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_provider_providerId_key" ON "User"("provider", "providerId");
