-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "deviceDbId" INTEGER;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_deviceDbId_fkey" FOREIGN KEY ("deviceDbId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
