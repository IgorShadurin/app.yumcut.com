CREATE TABLE `Daemon` (
  `id` varchar(128) NOT NULL,
  `lastSeenAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Project`
  ADD COLUMN `currentDaemonId` varchar(128) NULL,
  ADD COLUMN `currentDaemonLockedAt` datetime(3) NULL;

CREATE INDEX `Project_currentDaemonId_idx` ON `Project`(`currentDaemonId`);

ALTER TABLE `Job`
  ADD COLUMN `daemonId` varchar(128) NULL;

CREATE INDEX `Job_daemonId_idx` ON `Job`(`daemonId`);

ALTER TABLE `Project`
  ADD CONSTRAINT `Project_currentDaemonId_fkey` FOREIGN KEY (`currentDaemonId`) REFERENCES `Daemon`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Job`
  ADD CONSTRAINT `Job_daemonId_fkey` FOREIGN KEY (`daemonId`) REFERENCES `Daemon`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
