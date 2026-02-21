export type ApiRequestInit = RequestInit & { showErrorToast?: boolean; errorToastTitle?: string };

export async function api<T>(url: string, init?: ApiRequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } });
  let data: any = null;
  let text: string | null = null;
  try {
    // Try to parse JSON first
    data = await res.json();
  } catch (_) {
    // Fallback to text; may be empty on some 204/500 responses
    try { text = await res.text(); } catch {}
  }
  if (!res.ok) {
    // Prefer server-provided message, but try to extract field-level validation messages when available
    let message = (data && (data.error?.message || data.message)) || (text && text.trim()) || `Request failed with status ${res.status}`;
    if (data?.error?.code === 'VALIDATION_ERROR' && data?.error?.details) {
      try {
        const det = data.error.details as any;
        const msgs: string[] = [];
        if (det?.fieldErrors && typeof det.fieldErrors === 'object') {
          for (const arr of Object.values(det.fieldErrors as Record<string, string[]>)) {
            if (Array.isArray(arr)) msgs.push(...arr.filter(Boolean));
          }
        }
        if (Array.isArray(det?.formErrors)) msgs.push(...det.formErrors.filter(Boolean));
        if (Array.isArray(det?.issues)) msgs.push(...det.issues.map((i: any) => i?.message).filter(Boolean));
        if (Array.isArray(det?.errors)) msgs.push(...det.errors.map((i: any) => i?.message).filter(Boolean));
        if (msgs.length > 0) message = msgs[0];
      } catch {}
    }
    const err = { status: res.status, error: { code: data?.error?.code || 'REQUEST_FAILED', message } } as import('@/shared/types').ApiErrorShape & { status: number };
    // Default behavior: show error toast unless explicitly disabled.
    // Exception: do NOT show toasts for 401 (unauthorized) since it can be expected on public pages.
    const defaultShowToast = res.status !== 401;
    const showToast = init?.showErrorToast ?? defaultShowToast;
    if (showToast && typeof window !== 'undefined') {
      try {
        const { toast } = await import('sonner');
        toast.error(init?.errorToastTitle || 'Something went wrong', { description: message });
      } catch {}
    }
    throw err;
  }
  return (data as T) ?? ({} as T);
}

export const Api = {
  getSettings: () => api<import('@/shared/types').UserSettingsDTO>('/api/settings'),
  patchSetting: <K extends keyof import('@/shared/types').UserSettingsDTO>(
    key: K,
    value: import('@/shared/types').UserSettingsDTO[K]
  ) => api<Partial<import('@/shared/types').UserSettingsDTO>>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify({ key, value }),
  }),
  getAccountLanguage: () => api<{ language: import('@/shared/constants/app-language').AppLanguageCode }>('/api/account/language'),
  updateAccountLanguage: (
    language: import('@/shared/constants/app-language').AppLanguageCode,
    init?: ApiRequestInit,
  ) => api<{ language: import('@/shared/constants/app-language').AppLanguageCode }>('/api/account/language', {
    method: 'PATCH',
    body: JSON.stringify({ language }),
    ...(init ?? {}),
  }),
  getProjects: () => api('/api/projects'),
  getProject: (id: string) => api(`/api/projects/${id}`),
  getProjectStatus: (id: string) => api<import('@/shared/types').ProjectStatusDTO>(`/api/projects/${id}/status`),
  getTelegramAccount: () => api<import('@/shared/types').TelegramAccountStatusDTO>('/api/telegram/account'),
  createTelegramLinkToken: () => api<import('@/shared/types').TelegramLinkTokenDTO>('/api/telegram/link-token', { method: 'POST' }),
  disconnectTelegramAccount: () => api<{ ok: boolean }>('/api/telegram/account', { method: 'DELETE' }),
  getAdminNotificationSettings: () => api<import('@/shared/types').AdminNotificationSettingsDTO>('/api/admin/notifications'),
  updateAdminNotificationSettings: (payload: Partial<import('@/shared/types').AdminNotificationSettingsDTO>) =>
    api<import('@/shared/types').AdminNotificationSettingsDTO>('/api/admin/notifications', {
      method: 'PATCH',
      body: JSON.stringify(payload),
      errorToastTitle: 'Failed to update notification settings',
    }),
  getAdminVoiceProviderSettings: () => api<import('@/shared/types').AdminVoiceProviderSettingsDTO>('/api/admin/voice-providers'),
  updateAdminVoiceProviderSettings: (payload: import('@/shared/types').AdminVoiceProviderSettingsDTO) =>
    api<import('@/shared/types').AdminVoiceProviderSettingsDTO>('/api/admin/voice-providers', {
      method: 'PATCH',
      body: JSON.stringify(payload),
      errorToastTitle: 'Failed to update voice providers',
    }),
  getAdminImageEditorSettings: () => api<import('@/shared/types').AdminImageEditorSettingsDTO>('/api/admin/image-editor'),
  updateAdminImageEditorSettings: (payload: import('@/shared/types').AdminImageEditorSettingsDTO) =>
    api<import('@/shared/types').AdminImageEditorSettingsDTO>('/api/admin/image-editor', {
      method: 'PATCH',
      body: JSON.stringify(payload),
      errorToastTitle: 'Failed to update image editor settings',
    }),
  getAdminProjectCreationSettings: () =>
    api<import('@/shared/types').AdminProjectCreationSettingsDTO>('/api/admin/project-creation'),
  updateAdminProjectCreationSettings: (payload: import('@/shared/types').AdminProjectCreationSettingsDTO) =>
    api<import('@/shared/types').AdminProjectCreationSettingsDTO>('/api/admin/project-creation', {
      method: 'PATCH',
      body: JSON.stringify(payload),
      errorToastTitle: 'Failed to update project creation settings',
    }),
  deleteProject: (id: string) => api(`/api/projects/${id}`, { method: 'DELETE' }),
  createProject: (payload: any) => api<import('@/shared/types').ProjectListItemDTO>('/api/projects', { method: 'POST', body: JSON.stringify(payload) }),
  // Groups API
  createGroup: (payload: any) => api<{ id: string }>('/api/groups', { method: 'POST', body: JSON.stringify(payload) }),
  stopProject: (id: string) => api(`/api/projects/${id}/stop`, { method: 'POST' }),
  approveScript: (id: string, payload: { languageCode: string; text: string }[] | string) => {
    const body = typeof payload === 'string'
      ? { text: payload }
      : { scripts: payload };
    return api(`/api/projects/${id}/script/approve`, { method: 'POST', body: JSON.stringify(body) });
  },
  listAudios: (id: string) => api(`/api/projects/${id}/audios`),
  approveAudio: (id: string, selections: Array<{ languageCode: string; audioId: string }> | string) => {
    const payload = Array.isArray(selections)
      ? { selections }
      : { audioId: selections };
    return api(`/api/projects/${id}/audios/approve`, { method: 'POST', body: JSON.stringify(payload) });
  },
  requestScriptChange: (id: string, payload: { text: string; languageCode?: string; propagateTranslations?: boolean }) =>
    api(`/api/projects/${id}/script/request`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  regenerateAudios: (id: string, languageCode: string) => api(`/api/projects/${id}/audios/regenerate`, { method: 'POST', body: JSON.stringify({ languageCode }) }),
  regenerateProjectImage: (
    id: string,
    payload: { templateImageId: string; prompt: string; provider?: string; model?: string },
    options?: ApiRequestInit
  ) =>
    api<{
      templateImageId: string;
      provider: string;
      model: string;
      width: number;
      height: number;
      format: string;
      imageBase64: string;
    }>(`/api/projects/${id}/images/regenerate`, {
      method: 'POST',
      body: JSON.stringify(payload),
      errorToastTitle: 'Failed to regenerate image',
      ...(options ?? {}),
    }),
  replaceProjectImage: (
    id: string,
    payload: {
      templateImageId: string;
      data: string;
      signature: string;
      path: string;
      url: string;
      prompt?: string;
      model?: string;
    }
  ) =>
    api<{
      templateImageId: string;
      imageAssetId: string;
      imagePath: string;
      imageUrl: string | null;
    }>(`/api/projects/${id}/images/replace`, {
      method: 'POST',
      body: JSON.stringify(payload),
      errorToastTitle: 'Failed to replace image',
    }),
  recreateProjectVideo: (id: string) =>
    api<{ ok: boolean }>(`/api/projects/${id}/video/recreate`, {
      method: 'POST',
      errorToastTitle: 'Failed to re-create video',
    }),
  updateFinalScript: (id: string, payload: { text: string; languageCode?: string }) =>
    api<{ languageCode: string; text: string; finalScriptText?: string | null }>(`/api/projects/${id}/script/final`, {
      method: 'POST',
      body: JSON.stringify(payload),
      errorToastTitle: 'Failed to update final text script',
    }),
  getCharacters: () => api('/api/characters'),
  createCharacterUploadToken: () => api<{ data: string; signature: string; expiresAt: string; mimeTypes: string[]; maxBytes: number }>('/api/storage/upload-token', { method: 'POST' }),
  completeCharacterUpload: (payload: { data: string; signature: string; path: string; url: string; title: string; description?: string; attachToCharacterId?: string }) =>
    api('/api/characters/custom/upload', { method: 'POST', body: JSON.stringify(payload) }),
  generateCharacterImage: (payload: { title: string; description: string; attachToCharacterId?: string }) =>
    api('/api/characters/custom/generate', { method: 'POST', body: JSON.stringify(payload) }),
  createUserCharacter: (title: string, description?: string) => api('/api/characters/mine', { method: 'POST', body: JSON.stringify({ title, description }) }),
  createUserCharacterVariation: (userCharacterId: string, body: { title: string; description?: string; prompt?: string; }) =>
    api(`/api/characters/mine/${userCharacterId}/variations`, { method: 'POST', body: JSON.stringify(body) }),
  deleteUserCharacterVariation: (userCharacterId: string, variationId: string) =>
    api(`/api/characters/mine/${userCharacterId}/variations/${variationId}`, {
      method: 'DELETE',
      errorToastTitle: 'Failed to delete character',
    }),
  getTokenSummary: () => api<import('@/shared/types').TokenSummaryDTO>('/api/tokens'),
  getTokenHistory: (options?: { page?: number; pageSize?: number }) => {
    const params = new URLSearchParams();
    if (options?.page && Number.isFinite(options.page)) params.set('page', String(Math.max(1, Math.floor(options.page))));
    if (options?.pageSize && Number.isFinite(options.pageSize)) params.set('pageSize', String(Math.max(1, Math.floor(options.pageSize))));
    const qs = params.toString();
    const url = qs ? `/api/tokens/history?${qs}` : '/api/tokens/history';
    return api<import('@/shared/types').TokenHistoryDTO>(url);
  },
  adminAdjustTokens: (userId: string, payload: { amount: number; reason?: string }) => api(`/api/admin/users/${userId}/tokens`, {
    method: 'POST',
    body: JSON.stringify(payload),
    errorToastTitle: 'Failed to adjust balance',
  }),
  adminUpdateProjectStatus: (projectId: string, payload: {
    status: import('@/shared/constants/status').ProjectStatus;
    resetProgress?: boolean;
    languagesToReset?: string[];
  }) =>
    api<{ ok: boolean }>(`/api/admin/projects/${projectId}/status`, {
      method: 'POST',
      body: JSON.stringify(payload),
      errorToastTitle: 'Failed to change status',
    }),
  // Admin templates API
  adminTemplatesList: (entity: string) => api(`/api/admin/templates/${entity}`),
  adminTemplatesCreate: (entity: string, body: any) => api(`/api/admin/templates/${entity}`, { method: 'POST', body: JSON.stringify(body) }),
  adminTemplatesGet: (entity: string, id: string) => api(`/api/admin/templates/${entity}/${id}`),
  adminTemplatesUpdate: (entity: string, id: string, body: any) => api(`/api/admin/templates/${entity}/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  adminTemplatesDelete: (entity: string, id: string) => api(`/api/admin/templates/${entity}/${id}`, { method: 'DELETE' }),
  // Public templates API
  // Only public templates for main page
  listTemplates: () => api<Array<{
    id: string;
    title: string;
    description?: string | null;
    previewImageUrl: string;
    previewVideoUrl: string;
    isPublic: boolean;
    weight?: number | null;
    createdAt: string;
    updatedAt: string;
    customData?: import('@/shared/templates/custom-data').TemplateCustomData | null;
    captionsStyle?: { id: string; title: string } | null;
    overlay?: { id: string; title: string } | null;
    artStyle?: { id: string; title: string } | null;
    voice?: { id: string; title: string; description?: string | null; externalId?: string | null } | null;
  }>>('/api/templates?onlyPublic=1'),
  getTemplate: (id: string) => api<{ id: string; title: string; description?: string | null; previewImageUrl: string; previewVideoUrl: string; textPrompt?: string; isPublic: boolean; weight?: number | null; createdAt: string; updatedAt: string }>(`/api/templates/${id}`),
  getVoices: () => api<{ voices: import('@/shared/types').TemplateVoiceOptionDTO[] }>('/api/voices'),
  // Scheduler
  getSchedulerState: () => api<import('@/shared/types').SchedulerStateDTO>('/api/scheduler/settings'),
  updateSchedulerState: (payload: { defaultTimes?: Record<string, string>; cadence?: Record<string, import('@/shared/constants/publish-scheduler').SchedulerCadenceValue>; channelLanguages?: Array<{ channelId: string; languages: string[] }> }) =>
    api<import('@/shared/types').SchedulerStateDTO>('/api/scheduler/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
      errorToastTitle: 'Failed to update scheduler settings',
    }),
  scheduleProject: (projectId: string, payload?: { languages?: Array<{ languageCode: string; channelId?: string; title?: string; description?: string }> }) =>
    api<{ scheduled: number; tasks: Array<{ id: string; languageCode: string; publishAt: string; channelId: string; title: string | null; description: string | null }> }>(`/api/scheduler/projects/${projectId}`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
      errorToastTitle: 'Failed to schedule project',
    }),
  createSchedulerChannel: (payload: { provider: 'youtube'; channelId: string; displayName?: string; handle?: string; refreshToken?: string; accessToken?: string; scopes?: string }) =>
    api<{ channel: import('@/shared/types').PublishChannelDTO }>(`/api/scheduler/channels`, {
      method: 'POST',
      body: JSON.stringify(payload),
      errorToastTitle: 'Failed to connect channel',
    }),
  startSchedulerChannelOAuth: () =>
    api<{ authUrl: string }>(`/api/scheduler/channels/oauth/start`, {
      method: 'POST',
      errorToastTitle: 'Failed to start OAuth',
    }),
  deleteSchedulerChannel: (channelId: string) =>
    api<{ removed: boolean }>(`/api/scheduler/channels/${channelId}`, {
      method: 'DELETE',
      errorToastTitle: 'Failed to disconnect channel',
    }),
  revokeSchedulerChannel: (channelId: string) =>
    api<{ revoked: boolean }>(`/api/scheduler/channels/${channelId}/revoke`, {
      method: 'POST',
      errorToastTitle: 'Failed to revoke channel tokens',
    }),

  deleteAccount: (payload?: { reason?: string }) =>
    api<{ status: 'deleted' | 'already_deleted'; message: string }>('/api/account/delete', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
      errorToastTitle: 'Failed to delete account',
    }),

};
