import { prisma } from '@/server/db';
import { ProjectStatus } from '@/shared/constants/status';

export async function getAdminDashboardSnapshot() {
  const p = prisma as any;
  const [
    userCount,
    projectCount,
    pendingApprovals,
    errorCount,
    recentUsers,
    recentProjects,
    recentErrors,
    // Template system counts (public/private)
    templatesPublic,
    templatesPrivate,
    artStylesPublic,
    artStylesPrivate,
    voiceStylesPublic,
    voiceStylesPrivate,
    voicesPublic,
    voicesPrivate,
    musicPublic,
    musicPrivate,
    captionsPublic,
    captionsPrivate,
    overlaysPublic,
    overlaysPrivate,
  ] = await prisma.$transaction([
    prisma.user.count(),
    prisma.project.count({ where: { deleted: false } }),
    prisma.project.count({
      where: {
        deleted: false,
        status: {
          in: [
            ProjectStatus.ProcessScriptValidate,
            ProjectStatus.ProcessAudioValidate,
          ],
        },
      },
    }),
    prisma.project.count({ where: { deleted: false, status: ProjectStatus.Error } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true, createdAt: true },
      take: 5,
    }),
    prisma.project.findMany({
      where: { deleted: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
      take: 5,
    }),
    prisma.project.findMany({
      where: { deleted: false, status: ProjectStatus.Error },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        statusLog: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        user: { select: { id: true, email: true, name: true } },
      },
      take: 5,
    }),
    // Template system counts
    p.template.count({ where: { isPublic: true } }),
    p.template.count({ where: { isPublic: false } }),
    p.templateArtStyle.count({ where: { isPublic: true } }),
    p.templateArtStyle.count({ where: { isPublic: false } }),
    p.templateVoiceStyle.count({ where: { isPublic: true } }),
    p.templateVoiceStyle.count({ where: { isPublic: false } }),
    p.templateVoice.count({ where: { isPublic: true } }),
    p.templateVoice.count({ where: { isPublic: false } }),
    p.templateMusic.count({ where: { isPublic: true } }),
    p.templateMusic.count({ where: { isPublic: false } }),
    p.templateCaptionsStyle.count({ where: { isPublic: true } }),
    p.templateCaptionsStyle.count({ where: { isPublic: false } }),
    p.templateOverlay.count({ where: { isPublic: true } }),
    p.templateOverlay.count({ where: { isPublic: false } }),
  ]);

  return {
    counts: {
      users: userCount,
      projects: projectCount,
      pendingApprovals,
      errors: errorCount,
    },
    templateSystem: {
      templates: { public: templatesPublic, private: templatesPrivate },
      artStyles: { public: artStylesPublic, private: artStylesPrivate },
      voiceStyles: { public: voiceStylesPublic, private: voiceStylesPrivate },
      voices: { public: voicesPublic, private: voicesPrivate },
      music: { public: musicPublic, private: musicPrivate },
      captionsStyles: { public: captionsPublic, private: captionsPrivate },
      overlays: { public: overlaysPublic, private: overlaysPrivate },
    },
    recentUsers: recentUsers.map((u: { id: string; email: string; name: string | null; createdAt: Date }) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
    })),
    recentProjects: recentProjects.map((p: { id: string; title: string; status: string; createdAt: Date; user: { id: string; email: string; name: string | null } }) => ({
      id: p.id,
      title: p.title,
      status: p.status as ProjectStatus,
      createdAt: p.createdAt.toISOString(),
      user: {
        id: p.user.id,
        email: p.user.email,
        name: p.user.name,
      },
    })),
    recentErrors: recentErrors.map((p: { id: string; title: string; updatedAt: Date; statusLog: Array<{ message?: string | null }>; user: { id: string; email: string; name: string | null } }) => ({
      id: p.id,
      title: p.title,
      updatedAt: p.updatedAt.toISOString(),
      message: p.statusLog[0]?.message || null,
      user: {
        id: p.user.id,
        email: p.user.email,
        name: p.user.name,
      },
    })),
  };
}
