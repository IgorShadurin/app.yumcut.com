export type ApiRequestInit = RequestInit & { showErrorToast?: boolean; errorToastTitle?: string };

export async function api<T>(url: string, init?: ApiRequestInit): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const headers = isFormData
    ? { ...(init?.headers || {}) }
    : { 'content-type': 'application/json', ...(init?.headers || {}) };
  const res = await fetch(url, { ...init, headers });
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
    const err = {
      status: res.status,
      error: {
        code: data?.error?.code || 'REQUEST_FAILED',
        message,
        details: data?.error?.details,
      },
    } as import('@/shared/types').ApiErrorShape & { status: number };
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
  getImagePrankReuse: (id: string) => api<import('@/shared/types').ImagePrankReuseDTO>(
    `/api/projects/${encodeURIComponent(id)}/image-prank-reuse`,
  ),
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
  getAdminEmailSettings: () => api<import('@/shared/types').AdminEmailSettingsDTO>('/api/admin/emails'),
  updateAdminEmailSettings: (payload: Partial<import('@/shared/types').AdminEmailSettingsDTO>) =>
    api<import('@/shared/types').AdminEmailSettingsDTO>('/api/admin/emails', {
      method: 'PATCH',
      body: JSON.stringify(payload),
      errorToastTitle: 'Failed to update email settings',
    }),
  getAdminProjectCreationSettings: () =>
    api<import('@/shared/types').AdminProjectCreationSettingsDTO>('/api/admin/project-creation'),
  updateAdminProjectCreationSettings: (payload: import('@/shared/types').AdminProjectCreationSettingsDTO) =>
    api<import('@/shared/types').AdminProjectCreationSettingsDTO>('/api/admin/project-creation', {
      method: 'PATCH',
      body: JSON.stringify(payload),
      errorToastTitle: 'Failed to update project creation settings',
    }),
  recordProjectCreationAttempt: (payload: import('@/shared/types').ProjectCreationAttemptRequestDTO) =>
    api<import('@/shared/types').ProjectCreationAttemptResponseDTO>('/api/analytics/project-attempts', {
      method: 'POST',
      body: JSON.stringify(payload),
      showErrorToast: false,
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
  getImagePrankCatalog: () => api<import('@/shared/types').ImagePrankCatalogDTO>('/api/image-pranks'),
  createCharacterUploadToken: (payload?: { maxBytes?: number; ttlMs?: number }) =>
    api<{ data: string; signature: string; expiresAt: string; mimeTypes: string[]; maxBytes: number }>('/api/storage/upload-token', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
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
  getSubscriptionStatus: () => api<import('@/shared/types').SubscriptionStatusDTO>('/api/subscriptions/status'),
  createSubscriptionCheckout: (plan: 'weekly' | 'monthly' | 'monthly_pro') =>
    api<
      | { action: 'checkout'; url: string; sessionId: string }
      | { action: 'switched'; subscriptionId: string; planKey: 'weekly' | 'monthly' | 'monthly_pro' }
      | { action: 'already_on_plan'; planKey: 'weekly' | 'monthly' | 'monthly_pro' }
    >('/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan }),
      errorToastTitle: 'Failed to start checkout',
    }),
  createSubscriptionPortal: () =>
    api<{ url: string }>('/api/subscriptions/portal', {
      method: 'POST',
      errorToastTitle: 'Failed to open billing portal',
    }),
  createTokenTopUpCheckout: (tokenPackage: import('@/shared/constants/token-topups').TokenTopUpPackageKey) =>
    api<{ url: string; sessionId: string }>('/api/token-topups/checkout', {
      method: 'POST',
      body: JSON.stringify({ package: tokenPackage }),
      errorToastTitle: 'Failed to start token top-up checkout',
    }),
  getTokenTopUpStatus: (sessionId: string) =>
    api<
      | { status: 'pending' }
      | { status: 'credited'; tokens: number; creditedAt: string }
    >(`/api/token-topups/status?session_id=${encodeURIComponent(sessionId)}`),
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
  adminCharacterCategoriesList: () => api<{ items: Array<{ id: string; slug: string; titleEn: string; titleRu: string; isActive: boolean; priority: number }> }>('/api/admin/character-categories'),
  adminCharacterCategoriesCreate: (body: { slug: string; title: string; isActive?: boolean; priority?: number }) =>
    api<{ id: string; slug: string; titleEn: string; titleRu: string; isActive: boolean; priority: number }>('/api/admin/character-categories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminCharacterCategoriesUpdate: (id: string, body: { slug?: string; title?: string; isActive?: boolean; priority?: number }) =>
    api<{ id: string; slug: string; titleEn: string; titleRu: string; isActive: boolean; priority: number }>(`/api/admin/character-categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  adminImagePrankCategoriesList: () => api<{ items: Array<{ id: string; slug: string; titleEn: string; titleRu: string; subtitleEn: string | null; subtitleRu: string | null; isActive: boolean; priority: number }> }>('/api/admin/image-prank-categories'),
  adminImagePrankCategoriesCreate: (body: { slug: string; title: string; subtitle?: string; isActive?: boolean; priority?: number }) =>
    api<{ id: string; slug: string; titleEn: string; titleRu: string; subtitleEn: string | null; subtitleRu: string | null; isActive: boolean; priority: number }>('/api/admin/image-prank-categories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminImagePrankCategoriesUpdate: (id: string, body: { slug?: string; title?: string; subtitle?: string | null; isActive?: boolean; priority?: number }) =>
    api<{ id: string; slug: string; titleEn: string; titleRu: string; subtitleEn: string | null; subtitleRu: string | null; isActive: boolean; priority: number }>(`/api/admin/image-prank-categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  adminImagePrankCategoriesDelete: (id: string, options?: { deleteFiles?: boolean }) => {
    const qp = new URLSearchParams();
    if (options?.deleteFiles === true) qp.set('deleteFiles', '1');
    const query = qp.toString();
    const suffix = query ? `?${query}` : '';
    return api<{ ok: boolean }>(`/api/admin/image-prank-categories/${id}${suffix}`, { method: 'DELETE' });
  },
  adminImagePrankSubcategoriesList: (params?: { categoryId?: string | null }) => {
    const qp = new URLSearchParams();
    if (params?.categoryId) qp.set('categoryId', params.categoryId);
    const query = qp.toString() ? `?${qp.toString()}` : '';
    return api<{ items: Array<{ id: string; categoryId: string; slug: string; titleEn: string; titleRu: string; subtitleEn: string | null; subtitleRu: string | null; isActive: boolean; priority: number; category: { id: string; slug: string; titleEn: string } | null }> }>(`/api/admin/image-prank-subcategories${query}`);
  },
  adminImagePrankSubcategoriesCreate: (body: { categoryId: string; slug: string; title: string; subtitle?: string; isActive?: boolean; priority?: number }) =>
    api<{ id: string; categoryId: string; slug: string; titleEn: string; titleRu: string; subtitleEn: string | null; subtitleRu: string | null; isActive: boolean; priority: number; category: { id: string; slug: string; titleEn: string } | null }>('/api/admin/image-prank-subcategories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminImagePrankSubcategoriesUpdate: (id: string, body: { categoryId?: string; slug?: string; title?: string; subtitle?: string | null; isActive?: boolean; priority?: number }) =>
    api<{ id: string; categoryId: string; slug: string; titleEn: string; titleRu: string; subtitleEn: string | null; subtitleRu: string | null; isActive: boolean; priority: number; category: { id: string; slug: string; titleEn: string } | null }>(`/api/admin/image-prank-subcategories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  adminImagePrankSubcategoriesDelete: (id: string, options?: { deleteFiles?: boolean }) => {
    const qp = new URLSearchParams();
    if (options?.deleteFiles === true) qp.set('deleteFiles', '1');
    const query = qp.toString();
    const suffix = query ? `?${query}` : '';
    return api<{ ok: boolean }>(`/api/admin/image-prank-subcategories/${id}${suffix}`, { method: 'DELETE' });
  },
  adminImagePranksList: (params?: { q?: string; categoryId?: string | null; subcategoryId?: string | null; page?: number; pageSize?: number }) => {
    const qp = new URLSearchParams();
    const q = params?.q?.trim() || '';
    if (q) qp.set('q', q);
    if (params?.categoryId) qp.set('categoryId', params.categoryId);
    if (params?.subcategoryId) qp.set('subcategoryId', params.subcategoryId);
    if (typeof params?.page === 'number' && Number.isFinite(params.page)) qp.set('page', String(Math.max(1, Math.floor(params.page))));
    if (typeof params?.pageSize === 'number' && Number.isFinite(params.pageSize)) qp.set('pageSize', String(Math.max(1, Math.floor(params.pageSize))));
    const query = qp.toString() ? `?${qp.toString()}` : '';
    return api<{
      items: Array<{
        id: string;
        categoryId: string;
        subcategoryId: string | null;
        slug: string;
        titleEn: string;
        titleRu: string;
        descriptionEn: string | null;
        descriptionRu: string | null;
        imagePath: string;
        imageUrl: string | null;
        previewImagePath: string | null;
        previewImageUrl: string | null;
        isPublic: boolean;
        priority: number;
        category: { id: string; slug: string; titleEn: string } | null;
        subcategory: { id: string; slug: string; titleEn: string } | null;
        createdAt: string;
        updatedAt: string;
      }>;
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    }>(`/api/admin/image-pranks${query}`);
  },
  adminImagePrankCreate: async (payload: {
    categoryId: string;
    subcategoryId?: string | null;
    slug: string;
    title: string;
    description?: string;
    searchText?: string;
    isPublic?: boolean;
    priority?: number;
    image: File;
  }) => {
    const form = new FormData();
    form.set('categoryId', payload.categoryId);
    form.set('subcategoryId', payload.subcategoryId ?? '');
    form.set('slug', payload.slug);
    form.set('title', payload.title);
    form.set('description', payload.description ?? '');
    form.set('searchText', payload.searchText ?? '');
    form.set('isPublic', payload.isPublic ? 'true' : 'false');
    form.set('priority', String(payload.priority ?? 0));
    form.set('image', payload.image);
    return api<{ id: string } & Record<string, unknown>>('/api/admin/image-pranks', {
      method: 'POST',
      body: form,
      headers: {},
    });
  },
  adminImagePrankUpdate: async (id: string, payload: {
    categoryId?: string;
    subcategoryId?: string | null;
    slug?: string;
    title?: string;
    description?: string | null;
    searchText?: string | null;
    isPublic?: boolean;
    priority?: number;
    image?: File | null;
  }) => {
    const form = new FormData();
    if (payload.categoryId !== undefined) form.set('categoryId', payload.categoryId);
    if (payload.subcategoryId !== undefined) form.set('subcategoryId', payload.subcategoryId ?? '');
    if (payload.slug !== undefined) form.set('slug', payload.slug);
    if (payload.title !== undefined) form.set('title', payload.title);
    if (payload.description !== undefined) form.set('description', payload.description ?? '');
    if (payload.searchText !== undefined) form.set('searchText', payload.searchText ?? '');
    if (payload.isPublic !== undefined) form.set('isPublic', payload.isPublic ? 'true' : 'false');
    if (payload.priority !== undefined) form.set('priority', String(payload.priority));
    if (payload.image) form.set('image', payload.image);
    return api<{ id: string } & Record<string, unknown>>(`/api/admin/image-pranks/${id}`, {
      method: 'PATCH',
      body: form,
      headers: {},
    });
  },
  adminImagePrankDelete: (id: string, options?: { deleteFiles?: boolean }) => {
    const qp = new URLSearchParams();
    if (options?.deleteFiles === true) qp.set('deleteFiles', '1');
    const query = qp.toString();
    const suffix = query ? `?${query}` : '';
    return api<{ ok: boolean }>(`/api/admin/image-pranks/${id}${suffix}`, { method: 'DELETE' });
  },
  adminPaywallAttemptsList: (params?: { q?: string; userId?: string; from?: string; to?: string; page?: number; pageSize?: number }) => {
    const qp = new URLSearchParams();
    const q = params?.q?.trim() || '';
    if (q) qp.set('q', q);
    if (params?.userId?.trim()) qp.set('userId', params.userId.trim());
    if (params?.from) qp.set('from', params.from);
    if (params?.to) qp.set('to', params.to);
    if (typeof params?.page === 'number' && Number.isFinite(params.page)) qp.set('page', String(Math.max(1, Math.floor(params.page))));
    if (typeof params?.pageSize === 'number' && Number.isFinite(params.pageSize)) qp.set('pageSize', String(Math.max(1, Math.floor(params.pageSize))));
    const query = qp.toString() ? `?${qp.toString()}` : '';
    return api<{
      items: Array<{
        id: string;
        userId: string;
        projectId: string | null;
        clientAttemptId: string;
        promptText: string | null;
        promptMode: string | null;
        projectExperience: string | null;
        durationSeconds: number | null;
        tokenCost: number | null;
        tokenBalance: number | null;
        mainPageMode: string | null;
        mainPageCategoryId: string | null;
        characterSlug: string | null;
        templateId: string | null;
        utmSource: string | null;
        utmMedium: string | null;
        utmCampaign: string | null;
        intent: string | null;
        sourceToolSlug: string | null;
        referrerOrigin: string | null;
        referrerPath: string | null;
        landingPath: string | null;
        query: unknown;
        languageCodes: unknown;
        settingsSnapshot: unknown;
        rawContext: unknown;
        createdAt: string;
        updatedAt: string;
        user: { id: string; email: string | null; name: string | null; isAdmin: boolean; createdAt: string } | null;
      }>;
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    }>(`/api/admin/project-attempts/paywall${query}`);
  },
  adminCharactersList: (params?: { q?: string; categoryId?: string | null; page?: number; pageSize?: number }) => {
    const qp = new URLSearchParams();
    const q = params?.q?.trim() || '';
    if (q) qp.set('q', q);
    if (params?.categoryId) qp.set('categoryId', params.categoryId);
    if (typeof params?.page === 'number' && Number.isFinite(params.page)) qp.set('page', String(Math.max(1, Math.floor(params.page))));
    if (typeof params?.pageSize === 'number' && Number.isFinite(params.pageSize)) qp.set('pageSize', String(Math.max(1, Math.floor(params.pageSize))));
    const query = qp.toString() ? `?${qp.toString()}` : '';
    return api<{
      items: Array<{
        id: string;
        slug: string | null;
        name: string;
        title: string;
        bio: string | null;
        isPublic: boolean;
        priority: number;
        category: { id: string; slug: string; titleEn: string } | null;
        preparedImageUrl: string | null;
        emptyImageUrl: string | null;
        previewVideoUrl: string | null;
        previewVideoHasAudio: boolean;
        createdAt: string;
        updatedAt: string;
      }>;
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    }>(`/api/admin/characters${query}`);
  },
  adminCharacterCheckSlug: (params: { slug: string; categoryId?: string | null; excludeId?: string | null }) => {
    const qp = new URLSearchParams();
    const slug = params.slug.trim();
    if (slug) qp.set('slug', slug);
    if (params.categoryId) qp.set('categoryId', params.categoryId);
    if (params.excludeId) qp.set('excludeId', params.excludeId);
    return api<{ available: boolean; normalizedSlug: string }>(`/api/admin/characters/slug-availability?${qp.toString()}`);
  },
  adminCharacterNextPriority: (params: { categoryId: string }) => {
    const qp = new URLSearchParams();
    const categoryId = params.categoryId.trim();
    if (categoryId) qp.set('categoryId', categoryId);
    return api<{ highestPriority: number; nextPriority: number }>(`/api/admin/characters/next-priority?${qp.toString()}`);
  },
  adminCharacterUpdate: (id: string, body: {
    slug?: string;
    name?: string;
    title?: string;
    bio?: string | null;
    isPublic?: boolean;
    priority?: number;
    categoryId?: string;
    previewVideoHasAudio?: boolean;
  }) =>
    api<{ ok: boolean }>(`/api/admin/characters/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  adminCharacterDelete: (id: string, options?: { deleteFiles?: boolean }) => {
    const qp = new URLSearchParams();
    if (options?.deleteFiles === true) qp.set('deleteFiles', '1');
    const query = qp.toString();
    const suffix = query ? `?${query}` : '';
    return api<{ ok: boolean }>(`/api/admin/characters/${id}${suffix}`, { method: 'DELETE' });
  },
  adminCharactersBulkDelete: (ids: string[], options?: { deleteFiles?: boolean }) =>
    api<{ ok: boolean; deleted: number }>(`/api/admin/characters/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ ids, deleteFiles: options?.deleteFiles === true }),
    }),
  adminCharactersBulkVisibility: (ids: string[], isPublic: boolean) =>
    api<{ ok: boolean; updated: number }>(`/api/admin/characters/bulk-visibility`, {
      method: 'POST',
      body: JSON.stringify({ ids, isPublic }),
    }),
  adminCharacterUploadVideo: async (id: string, video: File, options?: { hasAudio?: boolean; processVideo?: boolean }) => {
    const form = new FormData();
    form.set('video', video);
    form.set('hasAudio', options?.hasAudio === false ? 'false' : 'true');
    form.set('processVideo', options?.processVideo === false ? 'false' : 'true');
    return api<{ ok: boolean; previewVideoUrl: string }>(`/api/admin/characters/${id}/video`, {
      method: 'POST',
      body: form,
      headers: {},
    });
  },
  adminCharacterDeleteVideo: (id: string) => api<{ ok: boolean }>(`/api/admin/characters/${id}/video`, { method: 'DELETE' }),
  adminCharacterImportValidationLimits: () => api<{ limits: import('@/shared/validators/admin-character-import').AdminCharacterImportValidationLimits }>('/api/admin/characters/import/validation'),
  adminCharacterImportPrecheck: (payload: {
    categoryId: string;
    rows: Array<{
      key: string;
      slug: string;
      name: string;
      title: string;
      bio?: string;
    }>;
  }) =>
    api<{
      items: Array<{
        key: string;
        issues: Array<{
          field: 'slug' | 'name' | 'title' | 'bio';
          message: string;
        }>;
      }>;
    }>('/api/admin/characters/import/precheck', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminCharacterPrioritiesCheck: (payload: {
    categoryId: string;
    slugs: string[];
  }) =>
    api<{
      categoryId: string;
      normalizedSlugs: string[];
      existingSlugs: string[];
      missingSlugs: string[];
      existingCount: number;
      missingCount: number;
    }>('/api/admin/characters/priorities/check', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminCharacterPrioritiesApply: (payload: {
    categoryId: string;
    slugs: string[];
  }) =>
    api<{
      categoryId: string;
      normalizedSlugs: string[];
      existingSlugs: string[];
      missingSlugs: string[];
      updatedCount: number;
      totalInCategory: number;
      highestPriority: number;
      step: number;
    }>('/api/admin/characters/priorities/apply', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminCharacterImport: async (payload: {
    categoryId: string;
    slug: string;
    name: string;
    title: string;
    bio?: string;
    isPublic?: boolean;
    prepared: File;
    empty: File;
  }) => {
    const form = new FormData();
    form.set('categoryId', payload.categoryId);
    form.set('slug', payload.slug);
    form.set('name', payload.name);
    form.set('title', payload.title);
    form.set('bio', payload.bio ?? '');
    form.set('isPublic', payload.isPublic ? 'true' : 'false');
    form.set('prepared', payload.prepared);
    form.set('empty', payload.empty);
    return api<{ status: 'saved' | 'skipped'; reason?: 'slug_exists'; characterId?: string }>('/api/admin/characters/import', {
      method: 'POST',
      body: form,
      headers: {},
    });
  },
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
  getVoices: () =>
    api<{
      voices: import('@/shared/types').TemplateVoiceOptionDTO[];
      providerAvailabilityRules: import('@/shared/voices/provider-availability-policy').VoiceProviderAvailabilityRuleDTO[];
    }>('/api/voices'),
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

  deleteAccount: (payload?: { reason?: string }, init?: ApiRequestInit) =>
    api<{
      status: 'deleted' | 'already_deleted';
      message: string;
      stripeCancellation?: {
        ok: true;
        action: 'no_stripe_subscription' | 'already_cancelled' | 'cancelled_at_period_end';
        subscriptionId?: string | null;
        cancellationEffectiveAt?: string | null;
      } | null;
    }>('/api/account/delete', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
      errorToastTitle: 'Failed to delete account',
      ...(init ?? {}),
    }),

};
