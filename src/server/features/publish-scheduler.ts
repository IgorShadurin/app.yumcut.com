import { config } from '@/server/config';

function parseBetaUsers(raw: string | undefined) {
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

const betaUsers = parseBetaUsers(config.PUBLISH_SCHEDULER_BETA_USERS);

export function isPublishSchedulerGloballyEnabled() {
  return Boolean(config.ENABLE_PUBLISH_SCHEDULER);
}

export function isPublishSchedulerEnabledForUser(user?: { id?: string | null }) {
  if (isPublishSchedulerGloballyEnabled()) return true;
  if (!user?.id) return false;
  return betaUsers.has(user.id);
}

export function getPublishSchedulerBetaUsers() {
  return betaUsers;
}
