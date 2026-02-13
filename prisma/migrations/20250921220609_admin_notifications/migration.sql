-- DropForeignKey
ALTER TABLE `TelegramAccount` DROP FOREIGN KEY `TelegramAccount_userId_fkey`;

-- DropForeignKey
ALTER TABLE `TelegramLinkToken` DROP FOREIGN KEY `TelegramLinkToken_userId_fkey`;

-- CreateTable
CREATE TABLE `AdminNotificationSetting` (
    `id` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `notifyNewUser` BOOLEAN NOT NULL DEFAULT true,
    `notifyNewProject` BOOLEAN NOT NULL DEFAULT true,
    `notifyProjectDone` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TelegramAccount` ADD CONSTRAINT `TelegramAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TelegramLinkToken` ADD CONSTRAINT `TelegramLinkToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
