/*
  Warnings:

  - A unique constraint covering the columns `[deviceId]` on the table `Resident` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Resident_deviceId_key" ON "Resident"("deviceId");
