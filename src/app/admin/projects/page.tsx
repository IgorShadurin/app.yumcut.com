import { listProjects } from '@/server/admin/projects';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminStatusPill } from '@/components/admin/AdminStatusPill';
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
  return page <= 1 ? '/admin/projects' : `/admin/projects?page=${page}`;
}

export default async function AdminProjectsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const resolved = await props.searchParams;
  const page = parsePage(resolved?.page);
  const pageSize = 20;
  const projects = await listProjects({ page, pageSize });

  return (
    <div className="space-y-6">
      <AdminBackButton className="w-fit" />

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-gray-500 dark:text-gray-300">Latest projects first. Jump in to inspect status, owners, or final outputs.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>All projects</CardTitle>
          <div className="text-sm text-gray-500 dark:text-gray-300">
            Page {projects.page} of {projects.totalPages} • {projects.total.toLocaleString()} total
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {projects.items.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">No projects found.</p>
          ) : (
            projects.items.map((project) => (
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
                <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-2">
                  <span>Owner: {project.user.name || project.user.email}</span>
                  {project.characterKind ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700 dark:border-gray-800 dark:text-gray-200">
                      {project.characterKind === 'dynamic' ? 'Character: Dynamic' : project.characterKind === 'user' ? 'Character: My library' : 'Character: Global'}
                    </span>
                  ) : null}
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {projects.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <Button asChild variant="outline" size="sm" disabled={projects.page <= 1}>
            <Link href={pageHref(projects.page - 1)}>Previous</Link>
          </Button>
          <Button asChild variant="outline" size="sm" disabled={projects.page >= projects.totalPages}>
            <Link href={pageHref(projects.page + 1)}>Next</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
