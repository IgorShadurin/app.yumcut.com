import { listUsers } from '@/server/admin/users';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminBackButton } from '@/components/admin/AdminBackButton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatDateTimeAdmin } from '@/lib/date';

function parsePage(value: string | string[] | undefined) {
  if (!value) return 1;
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function pageHref(page: number) {
  return page <= 1 ? '/admin/users' : `/admin/users?page=${page}`;
}

export default async function AdminUsersPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const resolved = await props.searchParams;
  const page = parsePage(resolved?.page);
  const pageSize = 20;
  const users = await listUsers({ page, pageSize });

  return (
    <div className="space-y-6">
      <AdminBackButton className="w-fit" />

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-gray-500 dark:text-gray-300">Newest accounts first. Click into a profile to inspect balances, projects, and ledger history.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>All users</CardTitle>
          <div className="text-sm text-gray-500 dark:text-gray-300">
            Page {users.page} of {users.totalPages} • {users.total.toLocaleString()} total
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {users.items.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">No users found.</p>
          ) : (
            users.items.map((user) => (
              <Link
                key={user.id}
                href={`/admin/users/${user.id}`}
                className="flex flex-col gap-2 rounded-lg border border-gray-200 px-4 py-3 transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-gray-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{user.name || user.email}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{formatDateTimeAdmin(user.createdAt)}</div>
                    {user.isAdmin ? <Badge variant="danger">Admin</Badge> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>ID: {user.id}</span>
                  <span>Tokens: <span className="font-semibold text-gray-900 dark:text-gray-100">{user.tokenBalance.toLocaleString()}</span></span>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {users.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <Button asChild variant="outline" size="sm" disabled={users.page <= 1}>
            <Link href={pageHref(users.page - 1)}>Previous</Link>
          </Button>
          <Button asChild variant="outline" size="sm" disabled={users.page >= users.totalPages}>
            <Link href={pageHref(users.page + 1)}>Next</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
