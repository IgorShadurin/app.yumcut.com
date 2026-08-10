import {
  IMAGE_PRANK_WEB_USER_PROMPT_MAX_CHARACTERS,
  RUNWARE_POSITIVE_PROMPT_MAX_CHARACTERS,
} from '@/shared/image-generation/prompt';

const jsonSchema = {
  type: 'object',
  additionalProperties: true,
} as const;

const errorResponse = {
  description: 'Error response',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: {},
            },
            required: ['code', 'message'],
          },
        },
        required: ['error'],
      },
    },
  },
};

const jsonResponse = (description: string, schema: Record<string, unknown> = jsonSchema) => ({
  description,
  content: {
    'application/json': { schema },
  },
});

const requestJson = (schema: Record<string, unknown> = jsonSchema) => ({
  required: true,
  content: {
    'application/json': { schema },
  },
});

const idempotencyHeader = {
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  schema: { type: 'string', minLength: 1, maxLength: 191 },
  description: 'Required for job-creating and token-costly writes. Reusing the same key replays the first successful response.',
};

const projectIdParam = {
  name: 'projectId',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

const characterSlugParam = {
  name: 'slug',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

const imagePrankSlugParam = {
  name: 'slug',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

const userCharacterIdParam = {
  name: 'userCharacterId',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

const variationIdParam = {
  name: 'variationId',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

const channelIdParam = {
  name: 'channelId',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

const taskIdParam = {
  name: 'taskId',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

const templateIdParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

const previewHeightParam = {
  name: 'h',
  in: 'query',
  required: true,
  schema: { type: 'integer', enum: [896] },
  description: 'Preview height. Currently only 896 is supported.',
};

const responses = {
  ok: jsonResponse('Success'),
  created: jsonResponse('Created'),
  accepted: jsonResponse('Accepted'),
  unauthorized: errorResponse,
  forbidden: errorResponse,
  notFound: errorResponse,
  validation: errorResponse,
  conflict: errorResponse,
};

function operation(input: {
  summary: string;
  description?: string;
  tags: string[];
  read?: boolean;
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
}) {
  return {
    summary: input.summary,
    ...(input.description ? { description: input.description } : {}),
    tags: input.tags,
    security: [{ BearerAuth: [] }],
    'x-yumcut-scope': input.read === false ? 'write' : 'read',
    ...(input.parameters ? { parameters: input.parameters } : {}),
    ...(input.requestBody ? { requestBody: input.requestBody } : {}),
    responses: {
      200: responses.ok,
      400: responses.validation,
      401: responses.unauthorized,
      403: responses.forbidden,
      404: responses.notFound,
      ...(input.responses ?? {}),
    },
  };
}

function writeOperation(input: Omit<Parameters<typeof operation>[0], 'read'>) {
  return operation({ ...input, read: false });
}

function idempotentWriteOperation(input: Omit<Parameters<typeof operation>[0], 'read' | 'parameters'> & { parameters?: unknown[] }) {
  return writeOperation({
    ...input,
    parameters: [idempotencyHeader, ...(input.parameters ?? [])],
    responses: {
      409: responses.conflict,
      ...(input.responses ?? {}),
    },
  });
}

const settingsPatchSchema = {
  type: 'object',
  properties: {
    key: {
      type: 'string',
      enum: [
        'includeDefaultMusic',
        'addOverlay',
        'includeCallToAction',
        'projectEmailsEnabled',
        'autoApproveScript',
        'autoApproveAudio',
        'watermarkEnabled',
        'captionsEnabled',
        'characterCreationSettings',
        'defaultDurationSeconds',
        'sidebarOpen',
        'defaultUseScript',
        'characterContentTone',
        'targetLanguages',
        'scriptCreationGuidance',
        'scriptCreationGuidanceEnabled',
        'scriptAvoidanceGuidance',
        'scriptAvoidanceGuidanceEnabled',
        'audioStyleGuidance',
        'audioStyleGuidanceEnabled',
        'characterSelection',
        'preferredVoiceId',
        'languageVoicePreferences',
        'preferredTemplateId',
        'schedulerDefaultTimes',
        'schedulerCadence',
      ],
    },
    value: {},
  },
  required: ['key', 'value'],
  additionalProperties: false,
};

const projectCreateSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description: `Project prompt. For image-generation projects, Runware processing limits the user prompt to ${RUNWARE_POSITIVE_PROMPT_MAX_CHARACTERS.toLocaleString('en-US')} characters for standalone images and ${IMAGE_PRANK_WEB_USER_PROMPT_MAX_CHARACTERS.toLocaleString('en-US')} characters when imagePrank is supplied.`,
    },
    rawScript: { type: 'string' },
    durationSeconds: { type: 'integer', minimum: 30 },
    languages: { type: 'array', items: { type: 'string' } },
    voiceId: { type: 'string' },
    projectExperience: { type: 'string', enum: ['story', 'character', 'image-generation'] },
    characterSlug: { type: 'string' },
    characterSelection: jsonSchema,
    imagePrank: jsonSchema,
    templateId: { type: 'string' },
    includeDefaultMusic: { type: 'boolean' },
    addOverlay: { type: 'boolean' },
    includeCallToAction: { type: 'boolean' },
    watermarkEnabled: { type: 'boolean' },
    captionsEnabled: { type: 'boolean' },
  },
  additionalProperties: true,
};

const nullableStringSchema = { type: ['string', 'null'] } as const;

const localizedCatalogTextSchema = {
  type: 'object',
  properties: {
    en: { type: 'string' },
    ru: { type: 'string' },
  },
  required: ['en', 'ru'],
} as const;

const imagePrankItemSchema = {
  type: 'object',
  description: 'Public Image Prank catalog item with source image and preview image fields.',
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    title: localizedCatalogTextSchema,
    description: localizedCatalogTextSchema,
    hiddenSearchText: localizedCatalogTextSchema,
    imageUrl: { type: 'string', description: 'Original/source prank image URL.' },
    imagePath: { type: 'string' },
    previewImageUrl: { ...nullableStringSchema, description: 'Display-safe preview image URL.' },
    previewImagePath: nullableStringSchema,
    categoryId: { type: 'string' },
    categorySlug: { type: 'string' },
    categoryTitle: localizedCatalogTextSchema,
    subcategoryId: nullableStringSchema,
    subcategorySlug: nullableStringSchema,
    subcategoryTitle: { anyOf: [localizedCatalogTextSchema, { type: 'null' }] },
  },
  required: ['id', 'slug', 'title', 'description', 'imageUrl', 'imagePath', 'categoryId', 'categorySlug', 'categoryTitle'],
} as const;

const imagePrankCatalogSchema = {
  type: 'object',
  properties: {
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          slug: { type: 'string' },
          title: localizedCatalogTextSchema,
          subtitle: localizedCatalogTextSchema,
          description: localizedCatalogTextSchema,
          hiddenSearchText: localizedCatalogTextSchema,
          subcategories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                categoryId: { type: 'string' },
                slug: { type: 'string' },
                title: localizedCatalogTextSchema,
                subtitle: localizedCatalogTextSchema,
                description: localizedCatalogTextSchema,
                hiddenSearchText: localizedCatalogTextSchema,
                items: { type: 'array', items: imagePrankItemSchema },
              },
            },
          },
          items: { type: 'array', items: imagePrankItemSchema },
        },
      },
    },
  },
  required: ['categories'],
} as const;

const characterCatalogCharacterSchema = {
  type: 'object',
  description: 'Public catalog character with preview image/video and metrics for the authenticated user.',
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    name: { type: 'string' },
    title: { type: 'string' },
    bio: { type: 'string' },
    hiddenSearchText: localizedCatalogTextSchema,
    previewImageUrl: { type: 'string' },
    previewVideoUrl: nullableStringSchema,
    previewVideoHasAudio: { type: 'boolean' },
    defaultVoiceId: nullableStringSchema,
    defaultVoiceProvider: nullableStringSchema,
    creationsCount: { type: 'integer' },
    favoritesCount: { type: 'integer' },
    isFavorited: { type: 'boolean' },
  },
  required: ['id', 'slug', 'name', 'title', 'bio', 'previewImageUrl', 'previewVideoUrl', 'previewVideoHasAudio', 'creationsCount', 'favoritesCount', 'isFavorited'],
} as const;

const characterCatalogSchema = {
  type: 'object',
  properties: {
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: localizedCatalogTextSchema,
          subtitle: localizedCatalogTextSchema,
          description: localizedCatalogTextSchema,
          hiddenSearchText: localizedCatalogTextSchema,
          characters: { type: 'array', items: characterCatalogCharacterSchema },
        },
        required: ['id', 'title', 'subtitle', 'description', 'characters'],
      },
    },
  },
  required: ['categories'],
} as const;

const characterProfileSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    characterId: { type: 'string' },
    slug: { type: 'string' },
    name: { type: 'string' },
    title: { type: 'string' },
    tagline: { type: 'string' },
    bio: { type: 'string' },
    previewImageUrl: { type: 'string' },
    previewVideoUrl: nullableStringSchema,
    previewVideoHasAudio: { type: 'boolean' },
    defaultVoiceId: nullableStringSchema,
    defaultVoiceProvider: nullableStringSchema,
    creationsCount: { type: 'integer' },
    favoritesCount: { type: 'integer' },
    isFavorited: { type: 'boolean' },
  },
  required: ['id', 'characterId', 'slug', 'name', 'title', 'tagline', 'bio', 'previewImageUrl', 'previewVideoUrl', 'previewVideoHasAudio', 'creationsCount', 'favoritesCount', 'isFavorited'],
} as const;

const templateSchema = {
  type: 'object',
  description: 'Story/template metadata. previewImageUrl and previewVideoUrl can be used to show the template before project creation.',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: nullableStringSchema,
    previewImageUrl: nullableStringSchema,
    previewVideoUrl: nullableStringSchema,
    weight: { type: 'number' },
    isPublic: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    customData: jsonSchema,
  },
  required: ['id', 'title', 'previewImageUrl', 'previewVideoUrl', 'isPublic'],
} as const;

export const userApiOpenApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'YumCut User API',
    version: '1.0.0',
    description: 'Bearer-key API for account data, user settings, project creation, project status polling, and final media URLs. API keys are managed from the web account page.',
  },
  servers: [
    { url: '/api/user/v1', description: 'Current YumCut deployment' },
  ],
  tags: [
    { name: 'Account' },
    { name: 'Tokens' },
    { name: 'Settings' },
    { name: 'Projects' },
    { name: 'Media' },
    { name: 'Characters' },
    { name: 'Catalog' },
    { name: 'Publishing' },
    { name: 'Telegram' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'YumCut User API key',
        description: 'Use a key created from Account API keys. User API keys start with ycu_.',
      },
    },
    schemas: {
      Error: (errorResponse.content['application/json'] as any).schema,
      ProjectCreate: projectCreateSchema,
      SettingsPatch: settingsPatchSchema,
      LocalizedCatalogText: localizedCatalogTextSchema,
      ImagePrankCatalog: imagePrankCatalogSchema,
      ImagePrankItem: imagePrankItemSchema,
      CharacterCatalog: characterCatalogSchema,
      CharacterProfile: characterProfileSchema,
      Template: templateSchema,
    },
  },
  paths: {
    '/account': {
      get: operation({
        summary: 'Get account',
        tags: ['Account'],
        responses: {
          200: jsonResponse('Account', {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: ['string', 'null'] },
              name: { type: ['string', 'null'] },
              image: { type: ['string', 'null'] },
              preferredLanguage: { type: ['string', 'null'] },
              createdAt: { type: 'string', format: 'date-time' },
              tokenBalance: { type: 'integer' },
              isGuest: { type: 'boolean' },
            },
          }),
        },
      }),
    },
    '/account/language': {
      get: operation({ summary: 'Get account language', tags: ['Account'] }),
      patch: writeOperation({
        summary: 'Update account language',
        tags: ['Account'],
        requestBody: requestJson({
          type: 'object',
          properties: { language: { type: 'string', enum: ['en', 'ru'] } },
          required: ['language'],
        }),
      }),
    },
    '/tokens': {
      get: operation({
        summary: 'Get token balance and cost table',
        tags: ['Tokens'],
      }),
    },
    '/tokens/history': {
      get: operation({
        summary: 'List token transactions',
        tags: ['Tokens'],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1 } },
        ],
      }),
    },
    '/settings': {
      get: operation({
        summary: 'Get user settings',
        tags: ['Settings'],
      }),
      patch: writeOperation({
        summary: 'Update one user setting',
        tags: ['Settings'],
        requestBody: requestJson(settingsPatchSchema),
      }),
    },
    '/project-cost': {
      post: operation({
        summary: 'Quote project token cost',
        tags: ['Projects', 'Tokens'],
        requestBody: requestJson(projectCreateSchema),
      }),
    },
    '/projects': {
      get: operation({
        summary: 'List own projects',
        tags: ['Projects'],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
      }),
      post: idempotentWriteOperation({
        summary: 'Create project',
        tags: ['Projects'],
        requestBody: requestJson(projectCreateSchema),
      }),
    },
    '/projects/{projectId}': {
      get: operation({
        summary: 'Get project detail',
        tags: ['Projects'],
        parameters: [projectIdParam],
      }),
      delete: writeOperation({
        summary: 'Cancel or delete own project',
        tags: ['Projects'],
        parameters: [projectIdParam],
      }),
    },
    '/projects/{projectId}/status': {
      get: operation({
        summary: 'Poll project status',
        tags: ['Projects'],
        parameters: [projectIdParam],
      }),
    },
    '/projects/{projectId}/stop': {
      post: writeOperation({
        summary: 'Stop own project',
        tags: ['Projects'],
        parameters: [projectIdParam],
      }),
    },
    '/projects/{projectId}/downloads/video': {
      get: operation({
        summary: 'Get final video download URL',
        tags: ['Projects', 'Media'],
        parameters: [projectIdParam],
      }),
    },
    '/projects/{projectId}/downloads/image': {
      get: operation({
        summary: 'Get final image download URL',
        tags: ['Projects', 'Media'],
        parameters: [projectIdParam],
      }),
    },
    '/projects/{projectId}/script/request': {
      post: idempotentWriteOperation({
        summary: 'Request script revision',
        tags: ['Projects'],
        parameters: [projectIdParam],
        requestBody: requestJson(),
      }),
    },
    '/projects/{projectId}/script/approve': {
      post: writeOperation({
        summary: 'Approve project script',
        tags: ['Projects'],
        parameters: [projectIdParam],
        requestBody: requestJson(),
      }),
    },
    '/projects/{projectId}/script/final': {
      post: writeOperation({
        summary: 'Update final script text',
        tags: ['Projects'],
        parameters: [projectIdParam],
        requestBody: requestJson(),
      }),
    },
    '/projects/{projectId}/audios': {
      get: operation({
        summary: 'List generated audios',
        tags: ['Projects', 'Media'],
        parameters: [projectIdParam],
      }),
    },
    '/projects/{projectId}/audios/request': {
      post: writeOperation({
        summary: 'Request voiceover generation',
        tags: ['Projects', 'Media'],
        parameters: [projectIdParam],
        requestBody: requestJson(),
      }),
    },
    '/projects/{projectId}/audios/approve': {
      post: writeOperation({
        summary: 'Approve voiceover',
        tags: ['Projects', 'Media'],
        parameters: [projectIdParam],
        requestBody: requestJson(),
      }),
    },
    '/projects/{projectId}/audios/regenerate': {
      post: idempotentWriteOperation({
        summary: 'Regenerate voiceover',
        tags: ['Projects', 'Media'],
        parameters: [projectIdParam],
        requestBody: requestJson(),
      }),
    },
    '/projects/{projectId}/images/regenerate': {
      post: idempotentWriteOperation({
        summary: 'Regenerate project image',
        tags: ['Projects', 'Media'],
        parameters: [projectIdParam],
        requestBody: requestJson(),
      }),
    },
    '/projects/{projectId}/images/replace': {
      post: writeOperation({
        summary: 'Replace project image',
        tags: ['Projects', 'Media'],
        parameters: [projectIdParam],
        requestBody: requestJson(),
      }),
    },
    '/projects/{projectId}/video/recreate': {
      post: idempotentWriteOperation({
        summary: 'Recreate final video',
        tags: ['Projects', 'Media'],
        parameters: [projectIdParam],
        requestBody: requestJson(),
      }),
    },
    '/projects/{projectId}/image-prank-reuse': {
      get: operation({
        summary: 'Get reusable Image Prank source data',
        tags: ['Projects', 'Media'],
        parameters: [projectIdParam],
      }),
    },
    '/storage/upload-token': {
      post: writeOperation({
        summary: 'Create signed upload token',
        tags: ['Media'],
        requestBody: requestJson({
          type: 'object',
          properties: {
            ttlMs: { type: 'integer', minimum: 1000, maximum: 1800000 },
            maxBytes: { type: 'integer', minimum: 1, maximum: 10485760 },
          },
        }),
      }),
    },
    '/media/grant': {
      post: writeOperation({
        summary: 'Grant access to uploaded media',
        tags: ['Media'],
        requestBody: requestJson(),
      }),
    },
    '/voices': {
      get: operation({ summary: 'List voices', tags: ['Catalog'] }),
    },
    '/templates': {
      get: operation({
        summary: 'List public and own templates',
        description: 'Returns story/template metadata including previewImageUrl and previewVideoUrl for pre-creation previews.',
        tags: ['Catalog'],
        parameters: [
          { name: 'public', in: 'query', schema: { type: 'string', enum: ['1'] } },
          { name: 'mine', in: 'query', schema: { type: 'string', enum: ['1'] } },
        ],
        responses: {
          200: jsonResponse('Templates', { type: 'array', items: templateSchema }),
        },
      }),
    },
    '/templates/{id}': {
      get: operation({
        summary: 'Get template',
        description: 'Returns one story/template with preview media and prompt metadata if the template is public or owned by the authenticated user.',
        tags: ['Catalog'],
        parameters: [templateIdParam],
        responses: {
          200: jsonResponse('Template', templateSchema),
        },
      }),
    },
    '/image-pranks': {
      get: operation({
        summary: 'List Image Prank catalog',
        description: 'Returns public Image Prank categories and items. Each item includes localized info, imageUrl, and previewImageUrl.',
        tags: ['Catalog'],
        responses: {
          200: jsonResponse('Image Prank catalog', imagePrankCatalogSchema),
        },
      }),
    },
    '/image-pranks/{slug}': {
      get: operation({
        summary: 'Get Image Prank catalog item',
        description: 'Returns one public Image Prank item by slug, including localized info, source image URL, and preview image URL.',
        tags: ['Catalog'],
        parameters: [imagePrankSlugParam],
        responses: {
          200: jsonResponse('Image Prank item', imagePrankItemSchema),
        },
      }),
    },
    '/groups': {
      post: idempotentWriteOperation({
        summary: 'Create project group',
        tags: ['Projects'],
        requestBody: requestJson(),
      }),
    },
    '/characters': {
      get: operation({
        summary: 'List catalog and own characters',
        description: 'Returns catalog and user-owned characters with variation imageUrl values for project creation pickers.',
        tags: ['Characters'],
      }),
    },
    '/characters/catalog': {
      get: operation({
        summary: 'List public character catalog',
        description: 'Returns public character categories and characters with slugs, previewImageUrl, previewVideoUrl, voice defaults, and viewer-specific favorite metrics.',
        tags: ['Characters', 'Catalog'],
        responses: {
          200: jsonResponse('Character catalog', characterCatalogSchema),
        },
      }),
    },
    '/characters/{slug}': {
      get: operation({
        summary: 'Get catalog character profile',
        description: 'Returns one public catalog character by slug, including profile info, preview image/video URLs, voice defaults, and viewer metrics.',
        tags: ['Characters'],
        parameters: [characterSlugParam],
        responses: {
          200: jsonResponse('Character profile', characterProfileSchema),
        },
      }),
    },
    '/characters/variations/{variationId}/preview-image': {
      get: operation({
        summary: 'Get catalog character variation preview image',
        description: 'Redirects to a prepared catalog preview image for a public character variation. Private/user-owned variations are not exposed.',
        tags: ['Characters', 'Media'],
        parameters: [variationIdParam, previewHeightParam],
        responses: {
          307: {
            description: 'Redirect to the prepared preview image URL.',
            headers: {
              Location: {
                schema: { type: 'string' },
              },
            },
          },
        },
      }),
    },
    '/characters/{slug}/favorite': {
      post: writeOperation({
        summary: 'Favorite catalog character',
        tags: ['Characters'],
        parameters: [characterSlugParam],
      }),
      delete: writeOperation({
        summary: 'Remove catalog character favorite',
        tags: ['Characters'],
        parameters: [characterSlugParam],
      }),
    },
    '/characters/custom/upload': {
      post: writeOperation({
        summary: 'Upload custom character image',
        tags: ['Characters', 'Media'],
        requestBody: requestJson(),
      }),
    },
    '/characters/custom/generate': {
      post: idempotentWriteOperation({
        summary: 'Generate custom character image',
        tags: ['Characters', 'Media'],
        requestBody: requestJson(),
      }),
    },
    '/characters/mine': {
      post: writeOperation({
        summary: 'Create own character',
        tags: ['Characters'],
        requestBody: requestJson(),
      }),
    },
    '/characters/mine/{userCharacterId}/variations': {
      post: writeOperation({
        summary: 'Create own character variation',
        tags: ['Characters'],
        parameters: [userCharacterIdParam],
        requestBody: requestJson(),
      }),
    },
    '/characters/mine/{userCharacterId}/variations/{variationId}': {
      delete: writeOperation({
        summary: 'Delete own character variation',
        tags: ['Characters'],
        parameters: [userCharacterIdParam, variationIdParam],
      }),
    },
    '/scheduler/settings': {
      get: operation({ summary: 'Get publishing scheduler settings', tags: ['Publishing'] }),
      post: writeOperation({
        summary: 'Update publishing scheduler settings',
        tags: ['Publishing'],
        requestBody: requestJson(),
      }),
      patch: writeOperation({
        summary: 'Update publishing scheduler settings',
        tags: ['Publishing'],
        requestBody: requestJson(),
      }),
    },
    '/scheduler/channels': {
      post: writeOperation({
        summary: 'Connect publishing channel',
        tags: ['Publishing'],
        requestBody: requestJson(),
      }),
    },
    '/scheduler/channels/{channelId}': {
      delete: writeOperation({
        summary: 'Delete publishing channel',
        tags: ['Publishing'],
        parameters: [channelIdParam],
      }),
    },
    '/scheduler/channels/{channelId}/revoke': {
      post: writeOperation({
        summary: 'Revoke publishing channel credentials',
        tags: ['Publishing'],
        parameters: [channelIdParam],
      }),
    },
    '/scheduler/projects/{projectId}': {
      post: idempotentWriteOperation({
        summary: 'Schedule project publishing',
        tags: ['Publishing'],
        parameters: [projectIdParam],
        requestBody: requestJson(),
      }),
    },
    '/scheduler/tasks/{taskId}/cleanup-request': {
      post: writeOperation({
        summary: 'Request scheduled task cleanup',
        tags: ['Publishing'],
        parameters: [taskIdParam],
      }),
    },
    '/telegram/account': {
      get: operation({ summary: 'Get linked Telegram account', tags: ['Telegram'] }),
      delete: writeOperation({ summary: 'Unlink Telegram account', tags: ['Telegram'] }),
    },
    '/telegram/link-token': {
      post: writeOperation({
        summary: 'Create Telegram link token',
        tags: ['Telegram'],
      }),
    },
  },
} as const;
