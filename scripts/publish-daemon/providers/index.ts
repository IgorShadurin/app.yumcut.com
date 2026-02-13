import type { PublishTaskPayload } from '../types';
import { scheduleYoutubeShort, cancelYoutubeShort } from './youtube';

type ProviderFn = (task: PublishTaskPayload) => Promise<{ providerTaskId?: string | null }>;
type CleanupFn = (task: PublishTaskPayload) => Promise<void>;

type ProviderModule = {
  schedule: ProviderFn;
  cancel?: CleanupFn;
};

const PROVIDERS: Record<string, ProviderModule> = {
  youtube: { schedule: scheduleYoutubeShort, cancel: cancelYoutubeShort },
};

export function getProvider(key: string): ProviderFn {
  const provider = PROVIDERS[key];
  if (!provider) {
    throw new Error(`Provider ${key} is not supported`);
  }
  return provider.schedule;
}

export function getCleanupProvider(key: string): CleanupFn | null {
  const provider = PROVIDERS[key];
  return provider?.cancel ?? null;
}
