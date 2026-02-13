export type SubscriptionProductConfig = {
  productId: string;
  tokens: number;
  label: string;
};

export const SUBSCRIPTION_PRODUCTS: Record<string, SubscriptionProductConfig> = {
  yumcut_weekly_basic: {
    productId: 'yumcut_weekly_basic',
    tokens: 150,
    label: 'Weekly Basic',
  },
  yumcut_monthly_basic: {
    productId: 'yumcut_monthly_basic',
    tokens: 600,
    label: 'Monthly Basic',
  },
};

export function getSubscriptionConfig(productId: string | undefined | null) {
  if (!productId) return undefined;
  return SUBSCRIPTION_PRODUCTS[productId];
}
