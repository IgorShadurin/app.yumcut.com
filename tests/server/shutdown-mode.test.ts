import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getShutdownDate, SignupsClosedError } from '@/server/shutdown-mode';

const db = vi.hoisted(() => ({
  account: { findUnique: vi.fn(), upsert: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock('@/server/db', () => ({ prisma: db }));
vi.mock('@/server/config', () => ({
  config: { GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test' },
}));

afterEach(() => vi.unstubAllEnvs());

describe('shutdown configuration', () => {
  it('requires explicit opt-in, even if a date is set', () => {
    vi.stubEnv('SHUTDOWN_DATE', '2027-01-31');
    for (const mode of [undefined, 'false', '0']) {
      vi.stubEnv('SHUTDOWN_MODE', mode);
      expect(getShutdownDate()).toBeNull();
    }
    vi.stubEnv('SHUTDOWN_MODE', 'true');
    expect(getShutdownDate()).toBe('2027-01-31');
  });

  it('uses the default for missing or invalid dates without reopening signups', () => {
    vi.stubEnv('SHUTDOWN_MODE', '1');
    for (const value of [undefined, 'invalid', '2026-02-30']) {
      vi.stubEnv('SHUTDOWN_DATE', value);
      expect(getShutdownDate()).toBe('2026-12-31');
    }
  });
});

describe('existing-account sign-in during shutdown', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('SHUTDOWN_MODE', 'true');
  });

  async function webSignIn(email?: string, verified = true) {
    const { authOptions } = await import('@/server/auth');
    return authOptions.callbacks!.signIn!({
      account: { provider: 'google', providerAccountId: 'subject', type: 'oauth' },
      user: { id: 'subject', email },
      profile: { email, email_verified: verified },
    });
  }

  it('sends a new user back to the sign-in notice and blocks the adapter write', async () => {
    expect(await webSignIn('new@example.com')).toBe('/');
    const { authOptions } = await import('@/server/auth');
    await expect(authOptions.adapter!.createUser!({ email: 'new@example.com', emailVerified: null }))
      .rejects.toBeInstanceOf(SignupsClosedError);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('allows new web users when the mode is disabled', async () => {
    vi.stubEnv('SHUTDOWN_MODE', 'false');
    expect(await webSignIn('new@example.com')).toBe(true);
  });

  it('accepts a linked provider even when no email is returned', async () => {
    db.account.findUnique.mockResolvedValue({ user: { id: 'existing' } });
    expect(await webSignIn()).toBe(true);
  });

  it('allows verified email linking and rejects unverified linking', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'existing', deleted: false });
    expect(await webSignIn('existing@example.com')).toBe(true);
    expect(await webSignIn('existing@example.com', false)).toBe(false);
  });

  it.each(['google', 'apple'] as const)('allows existing %s mobile users but rejects new ones', async (provider) => {
    const { ensureOAuthUser } = await import('@/server/mobile-auth/ensure-oauth-user');
    const options = { provider, profile: { providerAccountId: 'subject', email: 'user@example.com' } };
    await expect(ensureOAuthUser(options)).rejects.toBeInstanceOf(SignupsClosedError);
    expect(db.user.create).not.toHaveBeenCalled();
    const user = { id: 'existing', email: options.profile.email };
    db.user.findUnique.mockResolvedValue(user);
    expect(await ensureOAuthUser(options)).toBe(user);
    expect(db.account.upsert).toHaveBeenCalledOnce();
  });
});
