/*
  Warnings:

  - Changed the type of `modality` on the `Vacancy` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');

-- AlterTable
ALTER TABLE "Vacancy" ADD COLUMN     "listedSalaryMax" INTEGER,
ADD COLUMN     "listedSalaryMin" INTEGER,
DROP COLUMN "modality",
ADD COLUMN     "modality" "Modality" NOT NULL;

-- CreateIndex
CREATE INDEX "Vacancy_status_createdAt_idx" ON "Vacancy"("status", "createdAt");
