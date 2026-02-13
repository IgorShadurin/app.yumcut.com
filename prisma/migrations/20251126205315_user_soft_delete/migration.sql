-- AlterTable
ALTER TABLE `User` ADD COLUMN `deleted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletionReason` VARCHAR(512) NULL,
    ADD COLUMN `deletionSource` VARCHAR(32) NULL;
