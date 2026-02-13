import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  account: { findMany: vi.fn() },
  project: { findMany: vi.fn(), updateMany: vi.fn() },
  audioCandidate: { findMany: vi.fn() },
  imageAsset: { findMany: vi.fn() },
  videoAsset: { findMany: vi.fn() },
  userCharacterVariation: { findMany: vi.fn() },
  userCharacterImageTask: { findMany: vi.fn() },
  $transaction: vi.fn(),
};

const deleteStoredMedia = vi.fn();
const notifyAdminsOfAccountDeletion = vi.fn().mockResolvedValue(undefined);
const revokeAppleTokens = vi.fn();

vi.mock('@/server/db', () => ({ prisma: prismaMock }));
vi.mock('@/server/storage', () => ({ deleteStoredMedia }));
vi.mock('@/server/telegram', () => ({ notifyAdminsOfAccountDeletion }));
vi.mock('@/server/apple/revoke-tokens', () => ({ revokeAppleTokens }));

const { deleteUserAccount } = await import('@/server/account/delete-user');

beforeEach(() => {
  vi.clearAllMocks();
  notifyAdminsOfAccountDeletion.mockResolvedValue(undefined);
  prismaMock.user.findUnique.mockResolvedValue({
    id: 'user-1',
    deleted: false,
    email: 'user@example.com',
    name: 'User',
  });
  prismaMock.account.findMany.mockResolvedValue([]);
  prismaMock.project.findMany.mockResolvedValue([]);
  prismaMock.audioCandidate.findMany.mockResolvedValue([]);
  prismaMock.imageAsset.findMany.mockResolvedValue([]);
  prismaMock.videoAsset.findMany.mockResolvedValue([]);
  prismaMock.userCharacterVariation.findMany.mockResolvedValue([]);
  prismaMock.userCharacterImageTask.findMany.mockResolvedValue([]);
});

describe('deleteUserAccount', () => {
  it('removes project template image metadata during deletion', async () => {
    const tx = {
      publishTask: { deleteMany: vi.fn() },
      projectCharacterSelection: { deleteMany: vi.fn() },
      script: { deleteMany: vi.fn() },
      scriptRequest: { deleteMany: vi.fn() },
      audioRequest: { deleteMany: vi.fn() },
      audioCandidate: { deleteMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
      projectTemplateImage: { deleteMany: vi.fn() },
      imageAsset: { deleteMany: vi.fn() },
      videoAsset: { deleteMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
      projectLanguageProgress: { deleteMany: vi.fn(), upsert: vi.fn() },
      projectStatusHistory: { deleteMany: vi.fn(), create: vi.fn() },
      job: { deleteMany: vi.fn() },
      project: { updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
      projectGroupCharacterSelection: { deleteMany: vi.fn() },
      projectGroup: { deleteMany: vi.fn() },
      userCharacterImageTask: { deleteMany: vi.fn() },
      userCharacterVariation: { deleteMany: vi.fn() },
      userCharacter: { deleteMany: vi.fn() },
      publishChannelLanguage: { deleteMany: vi.fn() },
      publishChannelOAuthState: { deleteMany: vi.fn() },
      publishChannel: { deleteMany: vi.fn() },
      template: { deleteMany: vi.fn() },
      templateArtStyle: { deleteMany: vi.fn() },
      templateVoiceStyle: { deleteMany: vi.fn() },
      templateMusic: { deleteMany: vi.fn() },
      tokenTransaction: { deleteMany: vi.fn() },
      subscriptionPurchase: { deleteMany: vi.fn() },
      telegramLinkToken: { deleteMany: vi.fn() },
      telegramAccount: { deleteMany: vi.fn() },
      mobileSession: { deleteMany: vi.fn() },
      session: { deleteMany: vi.fn() },
      account: { deleteMany: vi.fn() },
      userSettings: { deleteMany: vi.fn() },
      user: { update: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await deleteUserAccount({ userId: 'user-1', source: 'web' });

    expect(tx.projectTemplateImage.deleteMany).toHaveBeenCalledWith({ where: { project: { userId: 'user-1' } } });
  });

  it('deletes uploaded image assets from storage', async () => {
    prismaMock.imageAsset.findMany.mockResolvedValue([
      { path: 'image/2024/01/uploaded.jpg', publicUrl: 'https://cdn.test/image/2024/01/uploaded.jpg' },
    ]);
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback({
      publishTask: { deleteMany: vi.fn() },
      projectCharacterSelection: { deleteMany: vi.fn() },
      script: { deleteMany: vi.fn() },
      scriptRequest: { deleteMany: vi.fn() },
      audioRequest: { deleteMany: vi.fn() },
      audioCandidate: { deleteMany: vi.fn() },
      projectTemplateImage: { deleteMany: vi.fn() },
      imageAsset: { deleteMany: vi.fn() },
      videoAsset: { deleteMany: vi.fn() },
      projectLanguageProgress: { deleteMany: vi.fn() },
      projectStatusHistory: { deleteMany: vi.fn() },
      job: { deleteMany: vi.fn() },
      project: { updateMany: vi.fn() },
      projectGroupCharacterSelection: { deleteMany: vi.fn() },
      projectGroup: { deleteMany: vi.fn() },
      userCharacterImageTask: { deleteMany: vi.fn() },
      userCharacterVariation: { deleteMany: vi.fn() },
      userCharacter: { deleteMany: vi.fn() },
      publishChannelLanguage: { deleteMany: vi.fn() },
      publishChannelOAuthState: { deleteMany: vi.fn() },
      publishChannel: { deleteMany: vi.fn() },
      template: { deleteMany: vi.fn() },
      templateArtStyle: { deleteMany: vi.fn() },
      templateVoiceStyle: { deleteMany: vi.fn() },
      templateMusic: { deleteMany: vi.fn() },
      tokenTransaction: { deleteMany: vi.fn() },
      subscriptionPurchase: { deleteMany: vi.fn() },
      telegramLinkToken: { deleteMany: vi.fn() },
      telegramAccount: { deleteMany: vi.fn() },
      mobileSession: { deleteMany: vi.fn() },
      session: { deleteMany: vi.fn() },
      account: { deleteMany: vi.fn() },
      userSettings: { deleteMany: vi.fn() },
      user: { update: vi.fn() },
    }));

    await deleteUserAccount({ userId: 'user-1', source: 'web' });

    expect(deleteStoredMedia).toHaveBeenCalledWith(
      expect.arrayContaining(['image/2024/01/uploaded.jpg', 'https://cdn.test/image/2024/01/uploaded.jpg']),
      { userId: 'user-1' },
    );
  });
});
