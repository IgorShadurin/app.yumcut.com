import { Prisma } from '@prisma/client';

export type TemplateImageMetadataRow = {
  assetId: string;
  imageName: string;
  model: string;
  prompt: string;
  sentence: string | null;
  size: string | null;
};

export async function storeTemplateImageMetadata(
  tx: Prisma.TransactionClient,
  projectId: string,
  entries: TemplateImageMetadataRow[],
) {
  if (!Array.isArray(entries) || entries.length === 0) {
    await tx.projectTemplateImage.deleteMany({ where: { projectId } });
    return;
  }

  const imageNames = entries.map((entry) => entry.imageName);
  await tx.projectTemplateImage.deleteMany({
    where: { projectId, imageName: { notIn: imageNames } },
  });

  for (const entry of entries) {
    await tx.projectTemplateImage.upsert({
      where: { projectId_imageName: { projectId, imageName: entry.imageName } },
      create: {
        projectId,
        imageAssetId: entry.assetId,
        imageName: entry.imageName,
        model: entry.model,
        prompt: entry.prompt,
        sentence: entry.sentence,
        size: entry.size,
      },
      update: {
        imageAssetId: entry.assetId,
        model: entry.model,
        prompt: entry.prompt,
        sentence: entry.sentence,
        size: entry.size,
      },
    });
  }
}
