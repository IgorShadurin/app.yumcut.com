CREATE TABLE `AdminSetting` (
  `id` char(36) NOT NULL,
  `key` varchar(128) NOT NULL,
  `value` json NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AdminSetting_key_key`(`key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `AdminSetting` (`id`, `key`, `value`, `createdAt`, `updatedAt`)
SELECT UUID(), 'voiceProviders', `enabledProviders`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `AdminVoiceProviderSetting`
LIMIT 1;
