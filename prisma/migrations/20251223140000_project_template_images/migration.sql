CREATE TABLE `ProjectTemplateImage` (
  `id` char(36) NOT NULL,
  `projectId` char(36) NOT NULL,
  `imageAssetId` char(36) NOT NULL,
  `imageName` varchar(256) NOT NULL,
  `model` varchar(128) NOT NULL,
  `prompt` longtext NOT NULL,
  `sentence` text NULL,
  `size` varchar(64) NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ProjectTemplateImage_imageAssetId_key`(`imageAssetId`),
  UNIQUE INDEX `ProjectTemplateImage_projectId_imageName_key`(`projectId`, `imageName`),
  INDEX `ProjectTemplateImage_projectId_idx`(`projectId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ProjectTemplateImage_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ProjectTemplateImage_imageAssetId_fkey` FOREIGN KEY (`imageAssetId`) REFERENCES `ImageAsset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
