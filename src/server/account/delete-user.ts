import { prisma } from '@/server/db';
import { ProjectStatus } from '@/shared/constants/status';
import { config } from '@/server/config';
import { revokeAppleTokens } from '@/server/apple/revoke-tokens';
import { notifyAdminsOfAccountDeletion } from '@/server/telegram';
import { deleteStoredMedia } from '@/server/storage';

export type DeleteUserAccountSource = 'mobile' | 'web' | 'support' | 'admin' | 'unknown';

export type DeleteUserAccountOptions = {
  userId: string;
  source: DeleteUserAccountSource;
  reason?: string | null;
};

export type DeleteUserAccountResult = {
  alreadyDeleted: boolean;
};

export async function deleteUserAccount(options: DeleteUserAccountOptions): Promise<DeleteUserAccountResult> {
  const { userId, source, reason } = options;
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, deleted: true, email: true, name: true },
  });
  if (!existingUser) {
    throw new Error('User not found');
  }
  if (existingUser.deleted) {
    return { alreadyDeleted: true };
  }

  const appleAccounts = await prisma.account.findMany({
    where: { userId, provider: 'apple' },
    select: { refresh_token: true, access_token: true },
  });
  const tokensToRevoke = appleAccounts
    .map((account) => {
      if (account.refresh_token) {
        return { token: account.refresh_token, tokenTypeHint: 'refresh_token' as const };
      }
      if (account.access_token) {
        return { token: account.access_token, tokenTypeHint: 'access_token' as const };
      }
      return null;
    })
    .filter((entry): entry is { token: string; tokenTypeHint: 'refresh_token' | 'access_token' } => !!entry)
    .map((entry) => ({ ...entry, clientId: config.APPLE_WEB_CLIENT_ID }));
  if (tokensToRevoke.length) {
    try {
      await revokeAppleTokens(tokensToRevoke);
    } catch (err) {
      console.warn('Failed to revoke Sign in with Apple tokens during account deletion', { userId, err });
    }
  }

  const now = new Date();
  const normalizedReason = reason?.trim().slice(0, 512) || null;
  const normalizedSource = source.slice(0, 32);
  const storageCandidates = await collectUserMediaPaths(userId);
  if (storageCandidates.length) {
    try {
      await deleteStoredMedia(storageCandidates, { userId });
    } catch (err) {
      console.error('Failed to delete user media from storage during account deletion', { userId, err });
      const message = err instanceof Error && err.message ? err.message : 'Unknown storage deletion error';
      throw new Error(`Failed to delete stored media before deleting account: ${message}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.publishTask.deleteMany({ where: { userId } });
    await tx.projectCharacterSelection.deleteMany({ where: { project: { userId } } });
    await tx.script.deleteMany({ where: { project: { userId } } });
    await tx.scriptRequest.deleteMany({ where: { project: { userId } } });
    await tx.audioRequest.deleteMany({ where: { project: { userId } } });
    await tx.audioCandidate.deleteMany({ where: { project: { userId } } });
    await tx.projectTemplateImage.deleteMany({ where: { project: { userId } } });
    await tx.imageAsset.deleteMany({ where: { project: { userId } } });
    await tx.videoAsset.deleteMany({ where: { project: { userId } } });
    await tx.projectLanguageProgress.deleteMany({ where: { project: { userId } } });
    await tx.projectStatusHistory.deleteMany({ where: { project: { userId } } });
    await tx.job.deleteMany({ where: { project: { userId } } });

    await tx.project.updateMany({
      where: { userId },
      data: {
        deleted: true,
        deletedAt: now,
        prompt: null,
        rawScript: null,
        finalScriptText: null,
        finalVoiceoverId: null,
        finalVoiceoverPath: null,
        finalVoiceoverUrl: null,
        finalVideoPath: null,
        finalVideoUrl: null,
        groupId: null,
        templateId: null,
        status: ProjectStatus.Cancelled,
      },
    });

    await tx.projectGroupCharacterSelection.deleteMany({ where: { group: { userId } } });
    await tx.projectGroup.deleteMany({ where: { userId } });

    await tx.userCharacterImageTask.deleteMany({ where: { userId } });
    await tx.userCharacterVariation.deleteMany({ where: { userCharacter: { userId } } });
    await tx.userCharacter.deleteMany({ where: { userId } });

    await tx.publishChannelLanguage.deleteMany({ where: { userId } });
    await tx.publishChannelOAuthState.deleteMany({ where: { userId } });
    await tx.publishChannel.deleteMany({ where: { userId } });

    await tx.template.deleteMany({ where: { ownerId: userId } });
    await tx.templateArtStyle.deleteMany({ where: { ownerId: userId } });
    await tx.templateVoiceStyle.deleteMany({ where: { ownerId: userId } });
    await tx.templateMusic.deleteMany({ where: { ownerId: userId } });

    await tx.tokenTransaction.deleteMany({ where: { userId } });
    await tx.subscriptionPurchase.deleteMany({ where: { userId } });
    await tx.telegramLinkToken.deleteMany({ where: { userId } });
    await tx.telegramAccount.deleteMany({ where: { userId } });
    await tx.mobileSession.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.userSettings.deleteMany({ where: { userId } });

    await tx.user.update({
      where: { id: userId },
      data: {
        deleted: true,
        deletedAt: now,
        deletionSource: normalizedSource,
        deletionReason: normalizedReason,
        tokenBalance: 0,
        name: null,
        image: null,
      },
    });
  });

  notifyAdminsOfAccountDeletion({
    userId,
    userEmail: existingUser.email,
    userName: existingUser.name,
    source: normalizedSource,
    reason: normalizedReason,
  }).catch((err) => {
    console.error('Failed to notify admins about account deletion', { userId, err });
  });

  return { alreadyDeleted: false };
}

async function collectUserMediaPaths(userId: string): Promise<string[]> {
  const [projects, audioCandidates, imageAssets, videoAssets, characterVariations, imageTasks] = await Promise.all([
    prisma.project.findMany({
      where: { userId },
      select: {
        finalVoiceoverPath: true,
        finalVoiceoverUrl: true,
        finalVideoPath: true,
        finalVideoUrl: true,
      },
    }),
    prisma.audioCandidate.findMany({
      where: { project: { userId } },
      select: { path: true, publicUrl: true },
    }),
    prisma.imageAsset.findMany({
      where: { project: { userId } },
      select: { path: true, publicUrl: true },
    }),
    prisma.videoAsset.findMany({
      where: { project: { userId } },
      select: { path: true, publicUrl: true },
    }),
    prisma.userCharacterVariation.findMany({
      where: { userCharacter: { userId } },
      select: { imagePath: true, imageUrl: true },
    }),
    prisma.userCharacterImageTask.findMany({
      where: { userId },
      select: { resultPath: true, resultUrl: true },
    }),
  ]);

  const collected = new Set<string>();
  const push = (value: string | null | undefined) => {
    if (!value) return;
    collected.add(value);
  };

  projects.forEach((project) => {
    push(project.finalVoiceoverPath);
    push(project.finalVoiceoverUrl);
    push(project.finalVideoPath);
    push(project.finalVideoUrl);
  });
  audioCandidates.forEach((candidate) => {
    push(candidate.path);
    push(candidate.publicUrl);
  });
  imageAssets.forEach((asset) => {
    push(asset.path);
    push(asset.publicUrl);
  });
  videoAssets.forEach((asset) => {
    push(asset.path);
    push(asset.publicUrl);
  });
  characterVariations.forEach((variation) => {
    push(variation.imagePath);
    push(variation.imageUrl);
  });
  imageTasks.forEach((task) => {
    push(task.resultPath);
    push(task.resultUrl);
  });

  return Array.from(collected);
}
