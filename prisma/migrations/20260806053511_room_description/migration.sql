/*
  Warnings:

  - You are about to drop the column `equipment` on the `rooms` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "rooms" DROP COLUMN "equipment",
ADD COLUMN     "description" TEXT;
