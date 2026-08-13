CREATE TABLE `TokenTopUpPurchase` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `stripeCheckoutSessionId` VARCHAR(128) NOT NULL,
    `stripePaymentIntentId` VARCHAR(128) NULL,
    `stripePriceId` VARCHAR(128) NOT NULL,
    `packageKey` VARCHAR(32) NOT NULL,
    `tokens` INTEGER NOT NULL,
    `amountTotal` INTEGER NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `livemode` BOOLEAN NOT NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TokenTopUpPurchase_stripeCheckoutSessionId_key`(`stripeCheckoutSessionId`),
    UNIQUE INDEX `TokenTopUpPurchase_stripePaymentIntentId_key`(`stripePaymentIntentId`),
    INDEX `TokenTopUpPurchase_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TokenTopUpPurchase` ADD CONSTRAINT `TokenTopUpPurchase_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
