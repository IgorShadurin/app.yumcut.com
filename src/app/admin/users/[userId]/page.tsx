import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUserDetail } from '@/server/admin/users';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminAdjustBalanceForm } from '@/components/admin/AdminAdjustBalanceForm';
import { AdminStatusPill } from '@/components/admin/AdminStatusPill';
import { AdminBackButton } from '@/components/admin/AdminBackButton';
import { formatDateTimeAdminLong, formatDateTimeAdmin } from '@/lib/date';

function parsePage(value: string | string[] | undefined) {
  if (!value) return 1;
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function transactionTypeLabel(type: string) {
  return type
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function makeHref(userId: string, nextTxPage: number, nextProjectPage: number) {
  const params = new URLSearchParams();
  if (nextTxPage > 1) params.set('txPage', String(nextTxPage));
  if (nextProjectPage > 1) params.set('projectsPage', String(nextProjectPage));
  const qs = params.toString();
  return qs ? `/admin/users/${userId}?${qs}` : `/admin/users/${userId}`;
}

export default async function AdminUserDetailPage(props: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await props.params;
  const resolvedSearch = await props.searchParams;
  const transactionPage = parsePage(resolvedSearch?.txPage);
  const projectPage = parsePage(resolvedSearch?.projectsPage);

  const detail = await getUserDetail(userId, {
    transactionPage,
    projectPage,
    transactionPageSize: 10,
    projectPageSize: 20,
  });

  if (!detail) {
    notFound();
  }

  const user = detail.user;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.name || user.email}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-300">Joined {formatDateTimeAdminLong(user.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          {user.isAdmin ? <Badge variant="danger">Administrator</Badge> : null}
          <Badge className="border border-gray-300 bg-transparent text-gray-600 dark:border-gray-700 dark:text-gray-300">User ID {user.id}</Badge>
        </div>
      </div>
      <AdminBackButton className="w-fit" />

      <div className="grid gap-4 lg:grid-cols-[3fr,2fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Account overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-center justify-between">
                <span>Email</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{user.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Balance</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{user.tokenBalance.toLocaleString()} tokens</span>
              </div>
              {user.telegramAccount ? (
                <div className="rounded-md border border-emerald-200/70 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <div className="flex items-center justify-between text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                    <span>Telegram</span>
                    <Badge variant="success">Connected</Badge>
                  </div>
                  <dl className="mt-3 grid gap-1">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-emerald-800 dark:text-emerald-200">Username</dt>
                      <dd className="font-mono text-[11px] leading-5 text-emerald-900 dark:text-emerald-100">
                        {user.telegramAccount.username ? `@${user.telegramAccount.username}` : '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-emerald-800 dark:text-emerald-200">Name</dt>
                      <dd className="text-emerald-900 dark:text-emerald-100">
                        {[user.telegramAccount.firstName, user.telegramAccount.lastName].filter(Boolean).join(' ') || '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-emerald-800 dark:text-emerald-200">Telegram ID</dt>
                      <dd className="font-mono text-[11px] leading-5 text-emerald-900 dark:text-emerald-100">{user.telegramAccount.telegramId}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-emerald-800 dark:text-emerald-200">Chat ID</dt>
                      <dd className="font-mono text-[11px] leading-5 text-emerald-900 dark:text-emerald-100">{user.telegramAccount.chatId}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-emerald-800 dark:text-emerald-200">Linked</dt>
                      <dd className="text-emerald-900 dark:text-emerald-100">
                        {formatDateTimeAdminLong(user.telegramAccount.linkedAt)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Projects</CardTitle>
              <div className="text-sm text-gray-500 dark:text-gray-300">
                Page {detail.projects.page} of {detail.projects.totalPages}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.projects.items.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-300">No projects found.</p>
              ) : (
                detail.projects.items.map((project) => (
                  <Link
                    key={project.id}
                    href={`/admin/projects/${project.id}`}
                    className="flex flex-col gap-2 rounded-lg border border-gray-200 px-4 py-3 transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-gray-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{project.title}</div>
                      <AdminStatusPill status={project.status} />
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Created {formatDateTimeAdmin(project.createdAt)}
                      <span className="mx-1">•</span>
                      Updated {formatDateTimeAdmin(project.updatedAt)}
                    </div>
                    {project.finalVideoAvailable ? (
                      <div className="text-xs font-medium text-emerald-600 dark:text-emerald-300">Final video available</div>
                    ) : null}
                  </Link>
                ))
              )}
            </CardContent>
            {detail.projects.totalPages > 1 ? (
              <div className="flex items-center justify-between px-6 pb-4">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={detail.projects.page <= 1}
                >
                  <Link href={makeHref(user.id, detail.tokenHistory.page, detail.projects.page - 1)}>Previous</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={detail.projects.page >= detail.projects.totalPages}
                >
                  <Link href={makeHref(user.id, detail.tokenHistory.page, detail.projects.page + 1)}>Next</Link>
                </Button>
              </div>
            ) : null}
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Adjust balance</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminAdjustBalanceForm userId={user.id} currentBalance={user.tokenBalance} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Token ledger</CardTitle>
          <div className="text-sm text-gray-500 dark:text-gray-300">
            Page {detail.tokenHistory.page} of {detail.tokenHistory.totalPages}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.tokenHistory.items.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">No token activity recorded.</p>
          ) : (
            detail.tokenHistory.items.map((tx) => {
              const positive = tx.delta >= 0;
              return (
                <div
                  key={tx.id}
                  className={`rounded-lg border p-4 ${positive ? 'border-emerald-200/70 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-rose-200/70 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Badge variant={positive ? 'success' : 'danger'} className="mb-2">
                        {transactionTypeLabel(tx.type)}
                      </Badge>
                      <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {positive ? '+' : '-'}{Math.abs(tx.delta).toLocaleString()} tokens
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Balance after: {tx.balanceAfter.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                      <div>{formatDateTimeAdmin(tx.createdAt)}</div>
                      {tx.initiator ? (
                        <div className="mt-1">Initiator: <span className="font-medium text-gray-700 dark:text-gray-200">{tx.initiator}</span></div>
                      ) : null}
                    </div>
                  </div>
                  {tx.description ? (
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">{tx.description}</p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
        {detail.tokenHistory.totalPages > 1 ? (
          <div className="flex items-center justify-between px-6 pb-4">
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={detail.tokenHistory.page <= 1}
            >
              <Link href={makeHref(user.id, detail.tokenHistory.page - 1, detail.projects.page)}>Previous</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={detail.tokenHistory.page >= detail.tokenHistory.totalPages}
            >
              <Link href={makeHref(user.id, detail.tokenHistory.page + 1, detail.projects.page)}>Next</Link>
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
