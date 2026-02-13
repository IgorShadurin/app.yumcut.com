-- AlterTable
ALTER TABLE `CharacterVariation` ADD COLUMN `imagePath` VARCHAR(512) NULL;

-- AlterTable
ALTER TABLE `UserCharacterVariation` ADD COLUMN `imagePath` VARCHAR(512) NULL,
    ADD COLUMN `imageUrl` VARCHAR(512) NULL,
    ADD COLUMN `source` VARCHAR(32) NULL,
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'ready';

-- AlterTable
ALTER TABLE `UserSettings` ADD COLUMN `preferredCharacter` JSON NULL;

-- CreateTable
CREATE TABLE `StorageUploadToken` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `tokenHash` VARCHAR(128) NOT NULL,
    `purpose` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StorageUploadToken_tokenHash_key`(`tokenHash`),
    INDEX `StorageUploadToken_userId_purpose_expiresAt_idx`(`userId`, `purpose`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserCharacterImageTask` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `variationId` CHAR(36) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
    `resultPath` VARCHAR(512) NULL,
    `resultUrl` VARCHAR(512) NULL,
    `failureReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserCharacterImageTask_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `UserCharacterImageTask_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StorageUploadToken` ADD CONSTRAINT `StorageUploadToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCharacterImageTask` ADD CONSTRAINT `UserCharacterImageTask_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCharacterImageTask` ADD CONSTRAINT `UserCharacterImageTask_variationId_fkey` FOREIGN KEY (`variationId`) REFERENCES `UserCharacterVariation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
