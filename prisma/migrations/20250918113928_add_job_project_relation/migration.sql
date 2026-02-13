-- CreateIndex
CREATE INDEX `Job_projectId_idx` ON `Job`(`projectId`);

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
