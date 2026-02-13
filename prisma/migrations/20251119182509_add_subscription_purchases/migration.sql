-- AlterTable
ALTER TABLE `MobileSession` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `ProjectLanguageProgress` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `PublishChannel` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `PublishTask` ALTER COLUMN `updatedAt` DROP DEFAULT,
    MODIFY `cleanupRequestedAt` DATETIME(3) NULL,
    MODIFY `cleanupCompletedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `SubscriptionPurchase` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `productId` VARCHAR(128) NOT NULL,
    `originalTransactionId` VARCHAR(128) NOT NULL,
    `transactionId` VARCHAR(128) NOT NULL,
    `environment` VARCHAR(32) NOT NULL,
    `purchaseDate` DATETIME(3) NOT NULL,
    `expiresDate` DATETIME(3) NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SubscriptionPurchase_transactionId_key`(`transactionId`),
    INDEX `SubscriptionPurchase_userId_productId_idx`(`userId`, `productId`),
    INDEX `SubscriptionPurchase_originalTransactionId_idx`(`originalTransactionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SubscriptionPurchase` ADD CONSTRAINT `SubscriptionPurchase_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
