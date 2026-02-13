import { NextRequest } from 'next/server';
import { withApiError } from '@/server/errors';
import { ok, unauthorized, error } from '@/server/http';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { deriveTitleFromText } from '@/server/title';
import { createGroupSchema } from '@/server/validators/groups';
import { notifyAdminsOfNewGroup } from '@/server/telegram';
import { config } from '@/server/config';
import { randomUUID } from 'crypto';

export const POST = withApiError(async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const body = await req.json();
  const parsed = createGroupSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues?.[0]?.message || 'Invalid group payload';
    return error('VALIDATION_ERROR', first, 400, parsed.error.flatten());
  }
  const data = parsed.data;

  if (data.characterSelection?.userCharacterId) {
    if (!data.characterSelection.variationId) {
      return error('VALIDATION_ERROR', 'Character variation is required', 400);
    }
    const variation = await prisma.userCharacterVariation.findFirst({
      where: {
        id: data.characterSelection.variationId,
        userCharacterId: data.characterSelection.userCharacterId,
        deleted: false,
        userCharacter: { userId, deleted: false },
      },
      select: { id: true },
    });
    if (!variation) {
      return error('VALIDATION_ERROR', 'Character variation not available', 400);
    }
  }

  const baseText = (data.useExactTextAsScript && data.rawScript) ? data.rawScript : (data.prompt || data.rawScript || 'New Group');
  const title = deriveTitleFromText(baseText);

  const group = await prisma.$transaction(async (tx) => {
    const selectionData = data.characterSelection
      ? {
          characterId: data.characterSelection.characterId || null,
          userCharacterId: data.characterSelection.userCharacterId || null,
          characterVariationId: data.characterSelection.characterId ? (data.characterSelection.variationId || null) : null,
          userCharacterVariationId: data.characterSelection.userCharacterId ? (data.characterSelection.variationId || null) : null,
        }
      : undefined;

    const baseData = {
      userId,
      title,
      description: null as string | null,
      prompt: (data.prompt || data.rawScript || null) as string | null,
      templateId: null as string | null,
      durationSeconds: (data.durationSeconds ?? null) as number | null,
      useExactTextAsScript: (data.useExactTextAsScript ?? null) as boolean | null,
      includeDefaultMusic: data.settings.includeDefaultMusic,
      addOverlay: data.settings.addOverlay,
      autoApproveScript: data.settings.autoApproveScript,
      autoApproveAudio: data.settings.autoApproveAudio,
      watermarkEnabled: data.settings.watermarkEnabled,
      captionsEnabled: data.settings.captionsEnabled,
      scriptCreationGuidanceEnabled: data.settings.scriptCreationGuidanceEnabled,
      scriptCreationGuidance: data.settings.scriptCreationGuidance,
      scriptAvoidanceGuidanceEnabled: data.settings.scriptAvoidanceGuidanceEnabled,
      scriptAvoidanceGuidance: data.settings.scriptAvoidanceGuidance,
      audioStyleGuidanceEnabled: data.settings.audioStyleGuidanceEnabled,
      audioStyleGuidance: data.settings.audioStyleGuidance,
      voiceId: data.voiceId || null,
      targetLanguage: data.languageCode || 'en',
    };

    const delegate = (tx as any).projectGroup;
    if (delegate && typeof delegate.create === 'function') {
      return await delegate.create({
        data: {
          ...baseData,
          ...(selectionData ? { selection: { create: selectionData } } : {}),
        },
      });
    }

    // Fallback: raw SQL insert to avoid delegate availability issues
    const id = randomUUID();
    await tx.$executeRaw`
      INSERT INTO ProjectGroup (
        id, userId, title, description, prompt, templateId,
        durationSeconds, useExactTextAsScript, includeDefaultMusic, addOverlay,
        autoApproveScript, autoApproveAudio, watermarkEnabled, captionsEnabled,
        scriptCreationGuidanceEnabled, scriptCreationGuidance,
        scriptAvoidanceGuidanceEnabled, scriptAvoidanceGuidance,
        audioStyleGuidanceEnabled, audioStyleGuidance,
        voiceId, targetLanguage, updatedAt
      ) VALUES (
        ${id}, ${baseData.userId}, ${baseData.title}, ${baseData.description}, ${baseData.prompt}, ${baseData.templateId},
        ${baseData.durationSeconds}, ${baseData.useExactTextAsScript}, ${baseData.includeDefaultMusic}, ${baseData.addOverlay},
        ${baseData.autoApproveScript}, ${baseData.autoApproveAudio}, ${baseData.watermarkEnabled}, ${baseData.captionsEnabled},
        ${baseData.scriptCreationGuidanceEnabled}, ${baseData.scriptCreationGuidance},
        ${baseData.scriptAvoidanceGuidanceEnabled}, ${baseData.scriptAvoidanceGuidance},
        ${baseData.audioStyleGuidanceEnabled}, ${baseData.audioStyleGuidance},
        ${baseData.voiceId}, ${baseData.targetLanguage}, NOW(3)
      )
    `;

    if (selectionData) {
      const selId = randomUUID();
      await tx.$executeRaw`
        INSERT INTO ProjectGroupCharacterSelection (
          id, groupId, characterId, characterVariationId, userCharacterId, userCharacterVariationId
        ) VALUES (
          ${selId}, ${id}, ${selectionData.characterId}, ${selectionData.characterVariationId}, ${selectionData.userCharacterId}, ${selectionData.userCharacterVariationId}
        )
      `;
    }

    const [created] = await tx.$queryRaw<any[]>`SELECT id, title FROM ProjectGroup WHERE id = ${id} LIMIT 1`;
    return created as { id: string; title: string };
  });

  // Notify admins (reuses new project toggle semantics)
  const ownerName = (session.user as any)?.name ?? null;
  const ownerEmail = session.user?.email ?? null;
  let groupUrl: string | null = null;
  const base = config.NEXTAUTH_URL?.trim();
  if (base) {
    try {
      groupUrl = new URL(`/admin`, base).toString();
    } catch {}
  }
  notifyAdminsOfNewGroup({
    groupId: group.id,
    title: group.title,
    userId,
    userEmail: ownerEmail,
    userName: ownerName,
    groupUrl,
  }).catch(() => {});

  return ok({ id: group.id });
}, 'Failed to create group');
