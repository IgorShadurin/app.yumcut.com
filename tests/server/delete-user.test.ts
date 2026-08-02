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
const cancelStripeSubscriptionForAccountDeletion = vi.fn();
const removeUserFromPlunkContactsInBackground = vi.fn();

function createTransactionMock() {
  return {
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
    plannedEmail: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    tokenTransaction: { deleteMany: vi.fn() },
    subscriptionPurchase: { deleteMany: vi.fn() },
    telegramLinkToken: { deleteMany: vi.fn() },
    telegramAccount: { deleteMany: vi.fn() },
    mobileSession: { deleteMany: vi.fn() },
    session: { deleteMany: vi.fn() },
    account: { deleteMany: vi.fn() },
    userSettings: { deleteMany: vi.fn() },
    user: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

vi.mock('@/server/db', () => ({ prisma: prismaMock }));
vi.mock('@/server/storage', () => ({ deleteStoredMedia }));
vi.mock('@/server/telegram', () => ({ notifyAdminsOfAccountDeletion }));
vi.mock('@/server/apple/revoke-tokens', () => ({ revokeAppleTokens }));
vi.mock('@/server/stripe/subscriptions', () => ({ cancelStripeSubscriptionForAccountDeletion }));
vi.mock('@/server/emails/plunk-contacts', () => ({ removeUserFromPlunkContactsInBackground }));

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
  cancelStripeSubscriptionForAccountDeletion.mockResolvedValue({
    ok: true,
    action: 'no_stripe_subscription',
  });
  removeUserFromPlunkContactsInBackground.mockReset();
});

describe('deleteUserAccount', () => {
  it('removes project template image metadata during deletion', async () => {
    const tx = createTransactionMock();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await deleteUserAccount({ userId: 'user-1', source: 'web' });

    expect(tx.projectTemplateImage.deleteMany).toHaveBeenCalledWith({ where: { project: { userId: 'user-1' } } });
    expect(tx.plannedEmail.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(removeUserFromPlunkContactsInBackground).toHaveBeenCalledWith(
      { userId: 'user-1', email: 'user@example.com' },
      'account-deleted',
    );
  });

  it('deletes uploaded image assets from storage', async () => {
    prismaMock.imageAsset.findMany.mockResolvedValue([
      { path: 'image/2024/01/uploaded.jpg', publicUrl: 'https://cdn.test/image/2024/01/uploaded.jpg' },
    ]);
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(createTransactionMock()));

    await deleteUserAccount({ userId: 'user-1', source: 'web' });

    expect(deleteStoredMedia).toHaveBeenCalledWith(
      expect.arrayContaining(['image/2024/01/uploaded.jpg', 'https://cdn.test/image/2024/01/uploaded.jpg']),
      { userId: 'user-1' },
    );
  });

  it('does not delete account data when Stripe subscription cancellation is required manually', async () => {
    cancelStripeSubscriptionForAccountDeletion.mockResolvedValue({
      ok: false,
      action: 'manual_cancellation_required',
      message: 'Cancel subscription manually before deleting account.',
      subscriptionId: 'sub_123',
      portalUrl: 'https://billing.stripe.test/session',
    });

    await expect(deleteUserAccount({ userId: 'user-1', source: 'web' })).rejects.toMatchObject({
      code: 'STRIPE_SUBSCRIPTION_CANCEL_REQUIRED',
      details: {
        subscriptionId: 'sub_123',
        portalUrl: 'https://billing.stripe.test/session',
      },
    });

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(deleteStoredMedia).not.toHaveBeenCalled();
  });

  it('deletes and notifies only once when concurrent requests observe an active account', async () => {
    let accountDeleted = false;
    const transactions = [createTransactionMock(), createTransactionMock()];
    for (const tx of transactions) {
      tx.user.updateMany.mockImplementation(async () => {
        if (accountDeleted) return { count: 0 };
        accountDeleted = true;
        return { count: 1 };
      });
    }
    prismaMock.$transaction
      .mockImplementationOnce(async (callback: any) => callback(transactions[0]))
      .mockImplementationOnce(async (callback: any) => callback(transactions[1]));

    const results = await Promise.all([
      deleteUserAccount({ userId: 'user-1', source: 'mobile', reason: 'mobile_settings_user_requested' }),
      deleteUserAccount({ userId: 'user-1', source: 'mobile', reason: 'mobile_settings_user_requested' }),
    ]);

    expect(results.map((result) => result.alreadyDeleted).sort()).toEqual([false, true]);
    expect(notifyAdminsOfAccountDeletion).toHaveBeenCalledTimes(1);
    expect(transactions[0].project.updateMany).toHaveBeenCalledTimes(1);
    expect(transactions[1].project.updateMany).not.toHaveBeenCalled();
  });
});
