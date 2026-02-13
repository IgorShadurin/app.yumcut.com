import { prisma } from '@/server/db';
import { ProjectStatus } from '@/shared/constants/status';

type PaginationInput = {
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function clampPageSize(pageSize?: number) {
  const base = typeof pageSize === 'number' && Number.isFinite(pageSize) ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(base, 1), MAX_PAGE_SIZE);
}

function normalizePage(page?: number) {
  const base = typeof page === 'number' && Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.max(base, 1);
}

export async function listUsers(pagination: PaginationInput = {}) {
  const take = clampPageSize(pagination.pageSize);
  const page = normalizePage(pagination.page);
  const skip = (page - 1) * take;

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        createdAt: true,
        tokenBalance: true,
        isAdmin: true,
      },
    }),
    prisma.user.count(),
  ]);

  return {
    items: items.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
    })),
    page,
    pageSize: take,
    total,
    totalPages: Math.max(Math.ceil(total / take), 1),
  };
}

export interface AdminUserDetailResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    createdAt: string;
    tokenBalance: number;
    isAdmin: boolean;
    telegramAccount: {
      telegramId: string;
      chatId: string;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      linkedAt: string;
    } | null;
  };
  tokenHistory: {
    items: Array<{
      id: string;
      delta: number;
      balanceAfter: number;
      type: string;
      description: string | null;
      initiator: string | null;
      metadata: unknown;
      createdAt: string;
    }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  projects: {
    items: Array<{
      id: string;
      title: string;
      status: ProjectStatus;
      createdAt: string;
      updatedAt: string;
      finalVideoAvailable: boolean;
    }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface AdminUserDetailOptions {
  transactionPage?: number;
  transactionPageSize?: number;
  projectPage?: number;
  projectPageSize?: number;
}

export async function getUserDetail(userId: string, options: AdminUserDetailOptions = {}): Promise<AdminUserDetailResult | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      createdAt: true,
      tokenBalance: true,
      isAdmin: true,
      telegramAccount: {
        select: {
          telegramId: true,
          chatId: true,
          username: true,
          firstName: true,
          lastName: true,
          linkedAt: true,
        },
      },
    },
  });
  if (!user) return null;

  const txTake = clampPageSize(options.transactionPageSize);
  const txPage = normalizePage(options.transactionPage);
  const txSkip = (txPage - 1) * txTake;

  const projectTake = clampPageSize(options.projectPageSize);
  const projectPage = normalizePage(options.projectPage);
  const projectSkip = (projectPage - 1) * projectTake;

  const [txItems, txTotal, projectItems, projectTotal] = await prisma.$transaction([
    prisma.tokenTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: txSkip,
      take: txTake,
    }),
    prisma.tokenTransaction.count({ where: { userId } }),
    prisma.project.findMany({
      where: { userId, deleted: false },
      orderBy: { createdAt: 'desc' },
      skip: projectSkip,
      take: projectTake,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        finalVideoPath: true,
        finalVideoUrl: true,
        videos: {
          where: { isFinal: true },
          select: { id: true },
          take: 1,
        },
      },
    }),
    prisma.project.count({ where: { userId, deleted: false } }),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      createdAt: user.createdAt.toISOString(),
      tokenBalance: user.tokenBalance,
      isAdmin: user.isAdmin,
      telegramAccount: user.telegramAccount
        ? {
            telegramId: user.telegramAccount.telegramId,
            chatId: user.telegramAccount.chatId,
            username: user.telegramAccount.username,
            firstName: user.telegramAccount.firstName,
            lastName: user.telegramAccount.lastName,
            linkedAt: user.telegramAccount.linkedAt.toISOString(),
          }
        : null,
    },
    tokenHistory: {
      items: txItems.map((tx) => ({
        ...tx,
        createdAt: tx.createdAt.toISOString(),
      })),
      total: txTotal,
      page: txPage,
      pageSize: txTake,
      totalPages: Math.max(Math.ceil(txTotal / txTake), 1),
    },
    projects: {
      items: projectItems.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status as ProjectStatus,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        finalVideoAvailable: Boolean(p.finalVideoUrl || p.finalVideoPath || p.videos.length > 0),
      })),
      total: projectTotal,
      page: projectPage,
      pageSize: projectTake,
      totalPages: Math.max(Math.ceil(projectTotal / projectTake), 1),
    },
  };
}
