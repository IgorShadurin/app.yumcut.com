export type TokenTopUpPackageKey = 'starter' | 'standard' | 'pro';

export type TokenTopUpPackage = {
  key: TokenTopUpPackageKey;
  tokens: number;
  priceUsd: number;
};

export const TOKEN_TOP_UP_PACKAGES: Record<TokenTopUpPackageKey, TokenTopUpPackage> = {
  starter: {
    key: 'starter',
    tokens: 75,
    priceUsd: 2.99,
  },
  standard: {
    key: 'standard',
    tokens: 750,
    priceUsd: 19.99,
  },
  pro: {
    key: 'pro',
    tokens: 1500,
    priceUsd: 34.99,
  },
};

export const TOKEN_TOP_UP_PACKAGE_ORDER: TokenTopUpPackageKey[] = ['starter', 'standard', 'pro'];

export function isTokenTopUpPackageKey(value: unknown): value is TokenTopUpPackageKey {
  return value === 'starter' || value === 'standard' || value === 'pro';
}
