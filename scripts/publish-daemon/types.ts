export type PublishChannelCredentials = {
  id: string;
  provider: string;
  channelId: string;
  displayName: string | null;
  handle: string | null;
  refreshToken: string | null;
  accessToken: string | null;
  tokenExpiresAt: string | null;
  scopes: string | null;
  metadata: Record<string, unknown> | null;
};

export type PublishTaskPayload = {
  id: string;
  userId: string;
  projectId: string;
  languageCode: string;
  channelId: string;
  platform: string;
  providerTaskId?: string | null;
  videoUrl: string;
  publishAt: string;
  title: string | null;
  description: string | null;
  status: string;
  createdAt: string;
  channel: PublishChannelCredentials;
};

export type SchedulerTasksResponse = {
  tasks: PublishTaskPayload[];
};
