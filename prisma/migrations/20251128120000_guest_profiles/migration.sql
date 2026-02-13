-- AlterTable
ALTER TABLE `User`
    ADD COLUMN `isGuest` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `guestConvertedAt` DATETIME(3) NULL,
    ADD COLUMN `guestDeviceId` VARCHAR(191) NULL;

CREATE INDEX `User_guestDeviceId_idx` ON `User`(`guestDeviceId`);

-- CreateTable
CREATE TABLE `GuestProfile` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `deviceName` VARCHAR(191) NULL,
    `platform` VARCHAR(64) NULL,
    `appVersion` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GuestProfile_userId_key`(`userId`),
    UNIQUE INDEX `GuestProfile_deviceId_key`(`deviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GuestProfile` ADD CONSTRAINT `GuestProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
