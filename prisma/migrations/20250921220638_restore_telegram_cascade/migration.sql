-- DropForeignKey
ALTER TABLE `TelegramAccount` DROP FOREIGN KEY `TelegramAccount_userId_fkey`;

-- DropForeignKey
ALTER TABLE `TelegramLinkToken` DROP FOREIGN KEY `TelegramLinkToken_userId_fkey`;

-- AddForeignKey
ALTER TABLE `TelegramAccount` ADD CONSTRAINT `TelegramAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TelegramLinkToken` ADD CONSTRAINT `TelegramLinkToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
