import Link from 'next/link';
import { LayoutTemplate, Palette, AudioLines, Mic, Music, Subtitles, Layers } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getAdminDashboardSnapshot } from '@/server/admin/dashboard';
import { getAdminNotificationSettings } from '@/server/admin/notifications';
import { getPublishTaskSnapshot } from '@/server/admin/publish-tasks';
import { getAdminVoiceProviderSettings } from '@/server/admin/voice-providers';
import { getAdminImageEditorSettings } from '@/server/admin/image-editor';
import { AdminStatusPill } from '@/components/admin/AdminStatusPill';
import { formatDateTimeAdmin } from '@/lib/date';
import { AdminNotificationSettingsForm } from '@/components/admin/AdminNotificationSettingsForm';
import { AdminVoiceProviderSettingsForm } from '@/components/admin/AdminVoiceProviderSettingsForm';
import { AdminImageEditorSettingsForm } from '@/components/admin/AdminImageEditorSettingsForm';
import { AdminUserCardMobile } from '@/components/admin/AdminUserCardMobile';
import { AdminProjectCardMobile } from '@/components/admin/AdminProjectCardMobile';

export default async function AdminHomePage() {
  const [snapshot, notificationSettings, publishQueue, voiceProviderSettings, imageEditorSettings] = await Promise.all([
    getAdminDashboardSnapshot(),
    getAdminNotificationSettings(),
    getPublishTaskSnapshot(),
    getAdminVoiceProviderSettings(),
    getAdminImageEditorSettings(),
  ]);
  const { counts } = snapshot;
  const queueStatuses = ['pending', 'retry', 'processing', 'scheduled', 'failed'] as const;
  const statusStyles: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    retry: 'bg-amber-50 text-amber-800 border-amber-200',
    processing: 'bg-sky-50 text-sky-800 border-sky-200',
    scheduled: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    failed: 'bg-rose-50 text-rose-800 border-rose-200',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Administrator dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-300">Monitor growth, troubleshoot failures, and jump into user accounts.</p>
        </div>
      </div>

      {/* Compact summary strip (works for mobile and desktop) */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-800 dark:bg-gray-950">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Total users</div>
              <div className="mt-1 text-2xl font-semibold leading-none">{counts.users.toLocaleString()}</div>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-800 dark:bg-gray-950">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Projects</div>
              <div className="mt-1 text-2xl font-semibold leading-none">{counts.projects.toLocaleString()}</div>
            </div>
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
              <div className="text-[11px] uppercase tracking-wide">Needs approval</div>
              <div className="mt-1 text-2xl font-semibold leading-none">{counts.pendingApprovals.toLocaleString()}</div>
            </div>
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
              <div className="text-[11px] uppercase tracking-wide">Active errors</div>
              <div className="mt-1 text-2xl font-semibold leading-none">{counts.errors.toLocaleString()}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between min-w-0">
            <CardTitle className="truncate">Recent users</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/users">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 overflow-hidden">
            {/* Mobile cards */}
            <div className="sm:hidden max-h-[45vh] overflow-auto pr-3 space-y-2">
              {snapshot.recentUsers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-300">No users yet.</p>
              ) : (
                snapshot.recentUsers.map((user: { id: string; email: string; name: string | null; createdAt: string }) => (
                  <AdminUserCardMobile
                    key={user.id}
                    id={user.id}
                    name={user.name}
                    email={user.email}
                    createdAtLabel={formatDateTimeAdmin(user.createdAt)}
                  />
                ))
              )}
            </div>
            {/* Desktop list */}
            <div className="hidden sm:block">
              {snapshot.recentUsers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-300">No users yet.</p>
              ) : (
                <div className="max-h-[45vh] w-full min-w-0 overflow-auto pr-1 space-y-3">
                  {snapshot.recentUsers.map((user: { id: string; email: string; name: string | null; createdAt: string }) => (
                    <Link
                      key={user.id}
                      href={`/admin/users/${user.id}`}
                      className="block w-full min-w-0 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700 dark:hover:bg-gray-900"
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">{user.name || user.email}</div>
                        <div className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{formatDateTimeAdmin(user.createdAt)}</div>
                      </div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400 break-words">{user.email}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between min-w-0">
            <CardTitle className="truncate">Recent projects</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/projects">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 overflow-hidden">
            {snapshot.recentProjects.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-300">No projects yet.</p>
            ) : (
              <div className="max-h-[45vh] w-full min-w-0 overflow-auto pr-1 space-y-2">
                {snapshot.recentProjects.map((project: { id: string; title: string; status: import('@/shared/constants/status').ProjectStatus; createdAt: string; user: { id: string; email: string; name: string | null } }) => (
                  <Link
                    key={project.id}
                    href={`/admin/projects/${project.id}`}
                    className="block w-full min-w-0 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700 dark:hover:bg-gray-900"
                  >
                    {/* Title + right-side pill (pill hidden on mobile) */}
                    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {project.title}
                      </div>
                      <div className="hidden shrink-0 sm:block">
                        <AdminStatusPill status={project.status} />
                      </div>
                    </div>
                    {/* Mobile status line */}
                    <div className="mt-1 flex items-center gap-2 sm:hidden">
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">Status</span>
                      <AdminStatusPill status={project.status} />
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Created {formatDateTimeAdmin(project.createdAt)}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500 break-words dark:text-gray-400">
                      {project.user.name || project.user.email}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between min-w-0">
            <CardTitle className="truncate">Recent projects</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/projects">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 overflow-hidden">
            {/* Mobile cards */}
            <div className="sm:hidden max-h-[45vh] overflow-auto pr-3 space-y-2">
              {snapshot.recentProjects.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-300">No projects yet.</p>
              ) : (
                snapshot.recentProjects.map((project: { id: string; title: string; status: import('@/shared/constants/status').ProjectStatus; createdAt: string; user: { id: string; email: string; name: string | null } }) => (
                  <AdminProjectCardMobile
                    key={project.id}
                    id={project.id}
                    title={project.title}
                    status={project.status}
                    createdAtLabel={formatDateTimeAdmin(project.createdAt)}
                    userDisplay={project.user.name || project.user.email}
                  />
                ))
              )}
            </div>
            {/* Desktop list */}
            <div className="hidden sm:block">
              {snapshot.recentProjects.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-300">No projects yet.</p>
              ) : (
                <div className="max-h-[45vh] w-full min-w-0 overflow-auto pr-1 space-y-3">
                  {snapshot.recentProjects.map((project: { id: string; title: string; status: import('@/shared/constants/status').ProjectStatus; createdAt: string; user: { id: string; email: string; name: string | null } }) => (
                    <Link
                      key={project.id}
                      href={`/admin/projects/${project.id}`}
                      className="block w-full min-w-0 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700 dark:hover:bg-gray-900"
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">{project.title}</div>
                        <div className="shrink-0">
                          <AdminStatusPill status={project.status} />
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Created {formatDateTimeAdmin(project.createdAt)}
                      </div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400 break-words">
                        {project.user.name || project.user.email}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest errors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {snapshot.recentErrors.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">No recent failures 🎉</p>
          ) : (
            <div className="max-h-[50vh] overflow-auto pr-1">
              {snapshot.recentErrors.map((project: { id: string; title: string; updatedAt: string; message: string | null; user: { id: string; email: string; name: string | null } }) => (
                <Link
                  key={project.id}
                  href={`/admin/projects/${project.id}`}
                  className="flex flex-col gap-1 rounded-lg border border-rose-200/70 bg-rose-50 px-4 py-3 text-rose-900 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
                >
                  <div className="flex items-center justify-between gap-2 text-sm font-semibold min-w-0">
                    <span className="min-w-0 flex-1 truncate pr-2">{project.title}</span>
                    <span className="shrink-0 text-xs font-normal">{formatDateTimeAdmin(project.updatedAt)}</span>
                  </div>
                  <div className="text-xs">{project.message || 'No error message recorded.'}</div>
                  <div className="truncate text-xs opacity-75">{project.user.name || project.user.email}</div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Telegram alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminNotificationSettingsForm initial={notificationSettings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Token pricing simulator</CardTitle>
            <CardDescription>Model cost and markup assumptions before updating retail token pricing.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link href="/admin/pricing">Open calculator</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/admin/pricing/gpu-roi">GPU ROI table</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-gray-500 dark:text-gray-300">
          Configure Google Nano Banana image pulls, ElevenLabs narration, and Claude copy costs inside a dedicated dashboard with live profit insights.
        </CardContent>
      </Card>

      {/* Video Templates & styles managers */}
      <Card>
        <CardHeader>
          <CardTitle>Video Templates & styles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="w-[25%] max-w-40 justify-start">
                <Link href="/admin/templates/manage/templates">
                  <LayoutTemplate className="mr-2 h-4 w-4" />
                  Video Templates
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                {snapshot.templateSystem.templates.public} public • {snapshot.templateSystem.templates.private} private
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="w-[25%] max-w-40 justify-start">
                <Link href="/admin/templates/manage/art-styles">
                  <Palette className="mr-2 h-4 w-4" />
                  Art styles
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                {snapshot.templateSystem.artStyles.public} public • {snapshot.templateSystem.artStyles.private} private
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="w-[25%] max-w-40 justify-start">
                <Link href="/admin/templates/manage/voice-styles">
                  <AudioLines className="mr-2 h-4 w-4" />
                  Voice styles
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                {snapshot.templateSystem.voiceStyles.public} public • {snapshot.templateSystem.voiceStyles.private} private
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="w-[25%] max-w-40 justify-start">
                <Link href="/admin/templates/manage/voices">
                  <Mic className="mr-2 h-4 w-4" />
                  Voices
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                {snapshot.templateSystem.voices.public} public • {snapshot.templateSystem.voices.private} private
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="w-[25%] max-w-40 justify-start">
                <Link href="/admin/templates/manage/music">
                  <Music className="mr-2 h-4 w-4" />
                  Music
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                {snapshot.templateSystem.music.public} public • {snapshot.templateSystem.music.private} private
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="w-[25%] max-w-40 justify-start">
                <Link href="/admin/templates/manage/captions-styles">
                  <Subtitles className="mr-2 h-4 w-4" />
                  Captions
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                {snapshot.templateSystem.captionsStyles.public} public • {snapshot.templateSystem.captionsStyles.private} private
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="w-[25%] max-w-40 justify-start">
                <Link href="/admin/templates/manage/overlays">
                  <Layers className="mr-2 h-4 w-4" />
                  Overlays
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                {snapshot.templateSystem.overlays.public} public • {snapshot.templateSystem.overlays.private} private
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Publish queue</CardTitle>
              <CardDescription>Latest 20 scheduler tasks across all channels.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/projects">Investigate projects</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {queueStatuses.map((status) => (
              <div key={status} className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-800 dark:bg-gray-950">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{status}</div>
                <div className="mt-1 text-xl font-semibold leading-none">{(publishQueue.counts[status] ?? 0).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 max-h-[380px] overflow-auto rounded-md border border-gray-100 dark:border-gray-800">
            {publishQueue.tasks.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-300">No scheduled uploads yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-300">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Channel</th>
                    <th className="px-3 py-2 text-left font-medium">Lang</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Publish at</th>
                    <th className="px-3 py-2 text-left font-medium">Project</th>
                    <th className="px-3 py-2 text-left font-medium">Error / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {publishQueue.tasks.map((task) => (
                    <tr key={task.id} className="align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{task.channel.label}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{task.channel.provider}</div>
                        {task.providerTaskId && (
                          <div className="text-[11px] text-gray-400 dark:text-gray-500">YT ID: {task.providerTaskId}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs uppercase text-gray-600 dark:text-gray-300">{task.languageCode}</td>
                      <td className="px-3 py-2">
                        <Badge className={`${statusStyles[task.status] ?? ''} capitalize`}>
                          {task.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{formatDateTimeAdmin(task.publishAt)}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                        {task.project ? (
                          <Link href={`/admin/projects/${task.project.id}`} className="text-blue-600 underline-offset-2 hover:underline">
                            {task.project.title || task.project.id}
                          </Link>
                        ) : (
                          '—'
                        )}
                        {task.user && (
                          <div className="text-[11px] text-gray-500 dark:text-gray-400">
                            {task.user.name || task.user.email}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300 max-w-xs">
                        {task.errorMessage ? task.errorMessage.slice(0, 160) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Project controls</CardTitle>
          <CardDescription>
            Configure voice providers and editor availability for new and completed projects.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Audio providers</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Choose which voice providers appear for new projects. Existing projects keep their current providers.
              </p>
            </div>
            <AdminVoiceProviderSettingsForm initial={voiceProviderSettings} />
            <Separator className="my-6" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Image editor</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Control whether completed v2 custom template projects can use the image editor.
              </p>
            </div>
            <AdminImageEditorSettingsForm initial={imageEditorSettings} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
