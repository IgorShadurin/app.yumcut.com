import { getShutdownDate } from '@/server/shutdown-mode';
import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { error, notFound, ok } from '@/server/http';
import { withApiError } from '@/server/errors';
import { runWithAuthenticatedApiUser } from '@/server/api-user';
import { requireUserApiKey, type UserApiKeyAuthContext } from '@/server/user-api/api-auth';
import {
  normalizeUserApiIdempotencyKey,
  runIdempotentUserApiOperation,
} from '@/server/user-api/api-idempotency';
import { getAccountLanguage, patchAccountLanguageSchema, updateAccountLanguage } from '@/server/account/language';
import { getTokenHistory, getTokenSummary } from '@/server/tokens';
import {
  CHARACTER_PROJECT_CREATION_TOKENS,
  MINIMUM_PROJECT_TOKENS,
  TOKEN_COSTS,
  calculateCharacterProjectTokenCost,
  calculateProjectTokenCost,
} from '@/shared/constants/token-costs';
import { createProjectSchema } from '@/server/validators/projects';
import { normalizeProjectExperience } from '@/shared/constants/project-experience';
import { DEFAULT_LANGUAGE, normalizeLanguageList } from '@/shared/constants/languages';
import {
  CHARACTER_VIDEO_QUALITY_TO_GENERATION_MODE,
  normalizeCharacterVideoGenerationMode,
  normalizeCharacterVideoQuality,
  qualityForVideoGenerationMode,
} from '@/shared/constants/character-video-quality';
import {
  cursorWhere,
  encodeReadApiCursor,
  parseReadApiListParams,
  noStoreInit,
} from '@/server/admin/read-api';
import {
  getCharacterCatalogProfileBySlug,
  listMobileCharacterCatalog,
} from '@/server/character-catalog';
import { getPublicImagePrankItemBySlug } from '@/server/image-pranks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { path?: string[] };
type RouteParams = { params: Promise<Record<string, string>> };
type RouteHandler = (req: Request, context?: RouteParams) => Response | Promise<Response>;

const DIRECT_READ_POSTS = new Set(['project-cost']);

function pathKey(parts: string[]) {
  return parts.join('/');
}

function requiredScope(method: string, parts: string[]) {
  if (method === 'GET' || method === 'HEAD') return 'read' as const;
  if (method === 'POST' && DIRECT_READ_POSTS.has(pathKey(parts))) return 'read' as const;
  return 'write' as const;
}

function context(params: Record<string, string>): RouteParams {
  return { params: Promise.resolve(params) };
}

function trunc(t: string) {
  return t.length > 30 ? `${t.slice(0, 27)}...` : t;
}

async function jsonBody(req: NextRequest) {
  return req.clone().json().catch(() => ({}));
}

async function call(handler: unknown, req: NextRequest, params?: Record<string, string>) {
  return (handler as RouteHandler)(req, params ? context(params) : undefined);
}

function idempotentAction(method: string, parts: string[]) {
  if (method !== 'POST') return null;
  const key = pathKey(parts);
  if (key === 'projects') return 'project.create';
  if (key === 'groups') return 'group.create';
  if (key === 'characters/custom/generate') return 'character.generate';
  if (parts.length === 4 && parts[0] === 'projects' && parts[2] === 'script' && parts[3] === 'request') {
    return 'project.script.request';
  }
  if (parts.length === 4 && parts[0] === 'projects' && parts[2] === 'audios' && parts[3] === 'regenerate') {
    return 'project.audio.regenerate';
  }
  if (parts.length === 4 && parts[0] === 'projects' && parts[2] === 'images' && parts[3] === 'regenerate') {
    return 'project.image.regenerate';
  }
  if (parts.length === 4 && parts[0] === 'projects' && parts[2] === 'video' && parts[3] === 'recreate') {
    return 'project.video.recreate';
  }
  if (parts.length === 3 && parts[0] === 'scheduler' && parts[1] === 'projects') {
    return 'scheduler.project.schedule';
  }
  return null;
}

async function withOptionalIdempotency(input: {
  auth: UserApiKeyAuthContext;
  req: NextRequest;
  parts: string[];
  run: () => Promise<Response>;
}) {
  const action = idempotentAction(input.req.method, input.parts);
  if (!action) return input.run();

  const idempotencyKey = normalizeUserApiIdempotencyKey(input.req);
  if (!idempotencyKey) {
    return error('VALIDATION_ERROR', 'Idempotency-Key header is required for this endpoint', 400);
  }

  const body = await jsonBody(input.req);
  return runIdempotentUserApiOperation({
    auth: input.auth,
    idempotencyKey,
    action,
    body,
    run: input.run,
  });
}

async function getAccount(auth: UserApiKeyAuthContext) {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      preferredLanguage: true,
      createdAt: true,
      tokenBalance: true,
      isGuest: true,
    },
  });
  if (!user) return notFound('Account not found');
  const shutdownDate = getShutdownDate();
  return ok({
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    preferredLanguage: user.preferredLanguage,
    createdAt: user.createdAt.toISOString(),
    tokenBalance: user.tokenBalance,
    isGuest: user.isGuest,
    ...(shutdownDate ? { shutdownDate } : {}),
  }, noStoreInit());
}

async function getTokens(auth: UserApiKeyAuthContext) {
  const summary = await getTokenSummary(auth.userId);
  return ok({
    balance: summary.balance,
    perSecondProject: TOKEN_COSTS.perSecondProject,
    minimumProjectTokens: MINIMUM_PROJECT_TOKENS,
    minimumProjectSeconds: TOKEN_COSTS.minimumProjectSeconds,
    characterProjectTokens: CHARACTER_PROJECT_CREATION_TOKENS,
    characterProjectTokenCosts: TOKEN_COSTS.characterProjects,
    actionCosts: TOKEN_COSTS.actions,
    signUpBonus: TOKEN_COSTS.signUpBonus,
  }, noStoreInit());
}

async function getTokenHistoryResponse(req: NextRequest, auth: UserApiKeyAuthContext) {
  const pageParam = Number(req.nextUrl.searchParams.get('page'));
  const pageSizeParam = Number(req.nextUrl.searchParams.get('pageSize'));
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0 ? Math.floor(pageSizeParam) : 20;
  const history = await getTokenHistory({ userId: auth.userId, page, pageSize });
  return ok({
    items: history.items.map((item) => ({
      id: item.id,
      delta: item.delta,
      balanceAfter: item.balanceAfter,
      type: item.type,
      description: item.description,
      initiator: item.initiator,
      metadata: item.metadata,
      createdAt: item.createdAt.toISOString(),
    })),
    total: history.total,
    page: history.page,
    pageSize: history.pageSize,
    totalPages: history.totalPages,
  }, noStoreInit());
}

async function getLanguage(auth: UserApiKeyAuthContext) {
  const language = await getAccountLanguage(auth.userId);
  if (!language) return notFound('Account not found');
  return ok({ language }, noStoreInit());
}

async function patchLanguage(req: NextRequest, auth: UserApiKeyAuthContext) {
  const parsed = patchAccountLanguageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid account language payload', 400, parsed.error.flatten());
  }
  const language = await updateAccountLanguage(auth.userId, parsed.data.language);
  if (!language) return notFound('Account not found');
  return ok({ language }, noStoreInit());
}

async function listProjects(req: NextRequest, auth: UserApiKeyAuthContext) {
  const parsed = parseReadApiListParams(req.nextUrl.searchParams);
  if (!parsed.params) return parsed.error;

  const status = req.nextUrl.searchParams.get('status')?.trim() || null;
  const rows = await prisma.project.findMany({
    where: {
      userId: auth.userId,
      deleted: false,
      ...(status ? { status } : {}),
      ...(cursorWhere(parsed.params.cursor) ?? {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: parsed.params.limit + 1,
    select: {
      id: true,
      title: true,
      status: true,
      prompt: true,
      finalVideoUrl: true,
      finalVideoPath: true,
      finalVoiceoverUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const visibleRows = rows.slice(0, parsed.params.limit);
  const last = visibleRows[visibleRows.length - 1] ?? null;
  return ok({
    items: visibleRows.map((project) => ({
      id: project.id,
      title: trunc(project.title),
      status: project.status,
      prompt: project.prompt,
      finalVideoUrl: project.finalVideoUrl ?? project.finalVideoPath ?? null,
      finalVoiceoverUrl: project.finalVoiceoverUrl ?? null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    })),
    limit: parsed.params.limit,
    nextCursor: rows.length > parsed.params.limit && last ? encodeReadApiCursor(last) : null,
  }, noStoreInit());
}

async function quoteProjectCost(req: NextRequest, auth: UserApiKeyAuthContext) {
  const json = await req.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid project payload', 400, parsed.error.flatten());
  }

  const data = parsed.data;
  const projectExperience = normalizeProjectExperience(data.projectExperience);
  let tokenCost: number;
  let detail: Record<string, unknown>;

  if (projectExperience === 'image-generation') {
    tokenCost = TOKEN_COSTS.actions.imageGeneration;
    detail = { projectExperience, action: 'imageGeneration' };
  } else if (projectExperience === 'character') {
    const payloadMode = normalizeCharacterVideoGenerationMode(data.videoGeneration?.mode);
    const quality = payloadMode
      ? qualityForVideoGenerationMode(payloadMode)
      : normalizeCharacterVideoQuality(data.characterVideoQuality);
    const mode = payloadMode ?? CHARACTER_VIDEO_QUALITY_TO_GENERATION_MODE[quality];
    tokenCost = calculateCharacterProjectTokenCost(quality);
    detail = { projectExperience, characterVideoQuality: quality, videoGenerationMode: mode };
  } else {
    const effectiveSeconds = Math.max(data.durationSeconds ?? TOKEN_COSTS.minimumProjectSeconds, TOKEN_COSTS.minimumProjectSeconds);
    const languages = normalizeLanguageList(data.languages ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
    tokenCost = calculateProjectTokenCost(effectiveSeconds) * Math.max(languages.length, 1);
    detail = {
      projectExperience,
      durationSeconds: effectiveSeconds,
      languageCount: languages.length,
      languages,
    };
  }

  const summary = await getTokenSummary(auth.userId);
  return ok({
    tokenCost,
    balance: summary.balance,
    hasEnoughTokens: summary.balance >= tokenCost,
    balanceAfter: Math.max(0, summary.balance - tokenCost),
    detail,
  }, noStoreInit());
}

async function dispatchAuthed(req: NextRequest, auth: UserApiKeyAuthContext, parts: string[]) {
  const method = req.method;

  if (method === 'GET' && pathKey(parts) === 'account') return getAccount(auth);
  if (method === 'GET' && pathKey(parts) === 'tokens') return getTokens(auth);
  if (method === 'GET' && pathKey(parts) === 'tokens/history') return getTokenHistoryResponse(req, auth);
  if (method === 'GET' && pathKey(parts) === 'account/language') return getLanguage(auth);
  if (method === 'PATCH' && pathKey(parts) === 'account/language') return patchLanguage(req, auth);
  if (method === 'POST' && pathKey(parts) === 'project-cost') return quoteProjectCost(req, auth);
  if (method === 'GET' && pathKey(parts) === 'projects') return listProjects(req, auth);

  if (pathKey(parts) === 'settings') {
    const route = await import('@/app/api/mobile/settings/route');
    if (method === 'GET') return route.GET(req);
    if (method === 'PATCH') return route.PATCH(req);
  }

  if (pathKey(parts) === 'projects') {
    const route = await import('@/app/api/projects/route');
    if (method === 'POST') return route.POST(req);
  }

  if (parts[0] === 'projects' && parts[1]) {
    const projectId = parts[1];
    if (parts.length === 2) {
      const route = await import('@/app/api/projects/[projectId]/route');
      if (method === 'GET') return call(route.GET, req, { projectId });
      if (method === 'DELETE') return call(route.DELETE, req, { projectId });
    }
    if (parts.length === 3 && parts[2] === 'status' && method === 'GET') {
      const route = await import('@/app/api/projects/[projectId]/status/route');
      return call(route.GET, req, { projectId });
    }
    if (parts.length === 3 && parts[2] === 'stop' && method === 'POST') {
      const route = await import('@/app/api/projects/[projectId]/stop/route');
      return call(route.POST, req, { projectId });
    }
    if (parts.length === 4 && parts[2] === 'downloads' && parts[3] === 'video' && method === 'GET') {
      const route = await import('@/app/api/projects/[projectId]/video/download/route');
      return call(route.GET, req, { projectId });
    }
    if (parts.length === 4 && parts[2] === 'downloads' && parts[3] === 'image' && method === 'GET') {
      const route = await import('@/app/api/projects/[projectId]/image/download/route');
      return call(route.GET, req, { projectId });
    }
    if (parts.length === 4 && parts[2] === 'script' && parts[3] === 'approve' && method === 'POST') {
      const route = await import('@/app/api/projects/[projectId]/script/approve/route');
      return call(route.POST, req, { projectId });
    }
    if (parts.length === 4 && parts[2] === 'script' && parts[3] === 'request' && method === 'POST') {
      const route = await import('@/app/api/projects/[projectId]/script/request/route');
      return call(route.POST, req, { projectId });
    }
    if (parts.length === 4 && parts[2] === 'script' && parts[3] === 'final' && method === 'POST') {
      const route = await import('@/app/api/projects/[projectId]/script/final/route');
      return call(route.POST, req, { projectId });
    }
    if (parts.length === 3 && parts[2] === 'audios' && method === 'GET') {
      const route = await import('@/app/api/projects/[projectId]/audios/route');
      return call(route.GET, req, { projectId });
    }
    if (parts.length === 4 && parts[2] === 'audios' && parts[3] === 'approve' && method === 'POST') {
      const route = await import('@/app/api/projects/[projectId]/audios/approve/route');
      return call(route.POST, req, { projectId });
    }
    if (parts.length === 4 && parts[2] === 'audios' && parts[3] === 'request' && method === 'POST') {
      const route = await import('@/app/api/projects/[projectId]/audios/request/route');
      return call(route.POST, req, { projectId });
    }
    if (parts.length === 4 && parts[2] === 'audios' && parts[3] === 'regenerate' && method === 'POST') {
      const route = await import('@/app/api/projects/[projectId]/audios/regenerate/route');
      return call(route.POST, req, { projectId });
    }
    if (parts.length === 3 && parts[2] === 'image-prank-reuse' && method === 'GET') {
      const route = await import('@/app/api/projects/[projectId]/image-prank-reuse/route');
      return call(route.GET, req, { projectId });
    }
    if (parts.length === 4 && parts[2] === 'images' && parts[3] === 'regenerate' && method === 'POST') {
      const route = await import('@/app/api/projects/[projectId]/images/regenerate/route');
      return call(route.POST, req, { projectId });
    }
    if (parts.length === 4 && parts[2] === 'images' && parts[3] === 'replace' && method === 'POST') {
      const route = await import('@/app/api/projects/[projectId]/images/replace/route');
      return call(route.POST, req, { projectId });
    }
    if (parts.length === 4 && parts[2] === 'video' && parts[3] === 'recreate' && method === 'POST') {
      const route = await import('@/app/api/projects/[projectId]/video/recreate/route');
      return call(route.POST, req, { projectId });
    }
  }

  if (method === 'GET' && pathKey(parts) === 'voices') {
    const route = await import('@/app/api/voices/route');
    return route.GET();
  }
  if (method === 'GET' && pathKey(parts) === 'templates') {
    const route = await import('@/app/api/templates/route');
    return route.GET(req);
  }
  if (method === 'GET' && parts.length === 2 && parts[0] === 'templates') {
    const route = await import('@/app/api/templates/[id]/route');
    return call(route.GET, req, { id: parts[1] });
  }
  if (method === 'GET' && pathKey(parts) === 'image-pranks') {
    const route = await import('@/app/api/image-pranks/route');
    return route.GET();
  }
  if (method === 'GET' && parts.length === 2 && parts[0] === 'image-pranks') {
    const item = await getPublicImagePrankItemBySlug(parts[1]);
    return item ? ok(item, noStoreInit()) : notFound('Image Prank item not found');
  }
  if (pathKey(parts) === 'storage/upload-token' && method === 'POST') {
    const route = await import('@/app/api/storage/upload-token/route');
    return route.POST(req);
  }
  if (pathKey(parts) === 'media/grant' && method === 'POST') {
    const route = await import('@/app/api/media/grant/route');
    return route.POST(req);
  }

  if (method === 'POST' && pathKey(parts) === 'groups') {
    const route = await import('@/app/api/groups/route');
    return route.POST(req);
  }

  if (method === 'GET' && pathKey(parts) === 'characters') {
    const route = await import('@/app/api/characters/route');
    return route.GET(req);
  }
  if (method === 'GET' && pathKey(parts) === 'characters/catalog') {
    const categories = await listMobileCharacterCatalog(auth.userId);
    return ok({ categories }, noStoreInit());
  }
  if (method === 'GET' && parts.length === 2 && parts[0] === 'characters') {
    const character = await getCharacterCatalogProfileBySlug(parts[1], { viewerUserId: auth.userId });
    return character ? ok(character, noStoreInit()) : notFound('Character not found');
  }
  if (method === 'GET' && parts.length === 4 && parts[0] === 'characters' && parts[1] === 'variations' && parts[3] === 'preview-image') {
    const route = await import('@/app/api/characters/variations/[variationId]/preview-image/route');
    return call(route.GET, req, { variationId: parts[2] });
  }
  if (parts.length === 3 && parts[0] === 'characters' && parts[2] === 'favorite') {
    const route = await import('@/app/api/characters/[slug]/favorite/route');
    if (method === 'POST') return call(route.POST, req, { slug: parts[1] });
    if (method === 'DELETE') return call(route.DELETE, req, { slug: parts[1] });
  }
  if (method === 'POST' && pathKey(parts) === 'characters/custom/upload') {
    const route = await import('@/app/api/characters/custom/upload/route');
    return route.POST(req);
  }
  if (method === 'POST' && pathKey(parts) === 'characters/custom/generate') {
    const route = await import('@/app/api/characters/custom/generate/route');
    return route.POST(req);
  }
  if (method === 'POST' && pathKey(parts) === 'characters/mine') {
    const route = await import('@/app/api/characters/mine/route');
    return route.POST(req);
  }
  if (method === 'POST' && parts.length === 4 && parts[0] === 'characters' && parts[1] === 'mine' && parts[3] === 'variations') {
    const route = await import('@/app/api/characters/mine/[userCharacterId]/variations/route');
    return call(route.POST, req, { userCharacterId: parts[2] });
  }
  if (method === 'DELETE' && parts.length === 5 && parts[0] === 'characters' && parts[1] === 'mine' && parts[3] === 'variations') {
    const route = await import('@/app/api/characters/mine/[userCharacterId]/variations/[variationId]/route');
    return call(route.DELETE, req, { userCharacterId: parts[2], variationId: parts[4] });
  }

  if (pathKey(parts) === 'scheduler/settings') {
    const route = await import('@/app/api/scheduler/settings/route');
    if (method === 'GET') return route.GET();
    if (method === 'POST' || method === 'PATCH') return route.POST(req);
  }
  if (method === 'POST' && pathKey(parts) === 'scheduler/channels') {
    const route = await import('@/app/api/scheduler/channels/route');
    return route.POST(req);
  }
  if (parts.length === 3 && parts[0] === 'scheduler' && parts[1] === 'channels') {
    if (method === 'DELETE') {
      const route = await import('@/app/api/scheduler/channels/[channelId]/route');
      return call(route.DELETE, req, { channelId: parts[2] });
    }
    if (method === 'POST' && parts[2]) {
      return notFound('Route not found');
    }
  }
  if (parts.length === 4 && parts[0] === 'scheduler' && parts[1] === 'channels' && parts[3] === 'revoke' && method === 'POST') {
    const route = await import('@/app/api/scheduler/channels/[channelId]/revoke/route');
    return call(route.POST, req, { channelId: parts[2] });
  }
  if (parts.length === 3 && parts[0] === 'scheduler' && parts[1] === 'projects' && method === 'POST') {
    const route = await import('@/app/api/scheduler/projects/[projectId]/route');
    return call(route.POST, req, { projectId: parts[2] });
  }
  if (parts.length === 4 && parts[0] === 'scheduler' && parts[1] === 'tasks' && parts[3] === 'cleanup-request' && method === 'POST') {
    const route = await import('@/app/api/scheduler/tasks/[taskId]/cleanup-request/route');
    return call(route.POST, req, { taskId: parts[2] });
  }

  if (pathKey(parts) === 'telegram/account') {
    const route = await import('@/app/api/telegram/account/route');
    if (method === 'GET') return route.GET(req);
    if (method === 'DELETE') return route.DELETE(req);
  }
  if (pathKey(parts) === 'telegram/link-token' && method === 'POST') {
    const route = await import('@/app/api/telegram/link-token/route');
    return route.POST(req);
  }

  return notFound('Route not found');
}

async function dispatch(req: NextRequest, params: Promise<Params>) {
  const { path = [] } = await params;
  const parts = path.map((part) => part.trim()).filter(Boolean);
  const scope = requiredScope(req.method, parts);
  const auth = await requireUserApiKey(req, scope);
  if (!auth.context) return auth.error;

  return runWithAuthenticatedApiUser(
    {
      userId: auth.context.userId,
      source: 'user-api',
      sessionUser: auth.context.sessionUser,
    },
    () => withOptionalIdempotency({
      auth: auth.context,
      req,
      parts,
      run: () => dispatchAuthed(req, auth.context, parts),
    }),
  );
}

export const GET = withApiError((req: NextRequest, { params }: { params: Promise<Params> }) => dispatch(req, params), 'Failed to process user API request');
export const POST = withApiError((req: NextRequest, { params }: { params: Promise<Params> }) => dispatch(req, params), 'Failed to process user API request');
export const PATCH = withApiError((req: NextRequest, { params }: { params: Promise<Params> }) => dispatch(req, params), 'Failed to process user API request');
export const DELETE = withApiError((req: NextRequest, { params }: { params: Promise<Params> }) => dispatch(req, params), 'Failed to process user API request');
