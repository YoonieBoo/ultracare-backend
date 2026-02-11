/*
  Warnings:

  - You are about to drop the column `deviceDbId` on the `Resident` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Resident" DROP CONSTRAINT "Resident_deviceDbId_fkey";

-- AlterTable
ALTER TABLE "Resident" DROP COLUMN "deviceDbId",
ADD COLUMN     "deviceId" INTEGER;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
