"use client";

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Api } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LANGUAGES } from '@/shared/constants/languages';
import { SCHEDULER_CADENCE_OPTIONS } from '@/shared/constants/publish-scheduler';
import type { SchedulerStateDTO } from '@/shared/types';
import { toast } from 'sonner';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';

export function SchedulerSection({ projectId }: { projectId: string }) {
  const { language } = useAppLanguage();
  const tr = (en: string): string => {
    if (language !== 'ru') return en;
    const map: Record<string, string> = {
      'Failed to load scheduler settings': 'Не удалось загрузить настройки планировщика',
      'Publisher schedule': 'План публикаций',
      'Scheduler defaults updated': 'Настройки планировщика обновлены',
      'Failed to update scheduler defaults': 'Не удалось обновить настройки планировщика',
      'Nothing scheduled': 'Ничего не запланировано',
      'Failed to schedule project': 'Не удалось запланировать проект',
      'Channel disconnected': 'Канал отключён',
      'Failed to disconnect channel': 'Не удалось отключить канал',
      'Channel tokens revoked': 'Токены канала отозваны',
      'Failed to revoke channel tokens': 'Не удалось отозвать токены канала',
      'Channel connected': 'Канал подключён',
      'Failed to connect channel': 'Не удалось подключить канал',
      'Failed to start Google OAuth': 'Не удалось запустить Google OAuth',
      'Channel assignments updated': 'Назначения каналов обновлены',
      'Failed to update channel assignments': 'Не удалось обновить назначения каналов',
      'Language': 'Язык',
      'Default time (UTC)': 'Время по умолчанию (UTC)',
      'Cadence': 'Частота',
      'Channel override': 'Переопределение канала',
      'Auto': 'Авто',
      'Save defaults': 'Сохранить настройки',
      'Schedule project': 'Запланировать проект',
      'Channel assignments': 'Назначения каналов',
      'Connect channel': 'Подключить канал',
      'Connect a channel to enable auto publishing.': 'Подключите канал, чтобы включить автопубликацию.',
      'Provider': 'Провайдер',
      'Revoke access': 'Отозвать доступ',
      'Disconnect': 'Отключить',
      'Save channel assignments': 'Сохранить назначения каналов',
      'Connect a channel': 'Подключить канал',
      'Use your YouTube (Shorts) brand account. Run through the OAuth flow, then paste the resulting tokens so YumCut can schedule uploads.':
        'Используйте ваш бренд-аккаунт YouTube (Shorts). Пройдите OAuth и вставьте полученные токены, чтобы YumCut мог планировать публикации.',
      'Redirecting…': 'Переходим…',
      'Connect with Google': 'Подключить через Google',
      'Prefer manual entry? Fill the fields below.': 'Хотите вручную? Заполните поля ниже.',
      'Open OAuth instructions': 'Открыть инструкцию по OAuth',
      'Select provider': 'Выберите провайдера',
      'Channel ID': 'ID канала',
      'Display name': 'Название канала',
      'Handle (optional)': 'Никнейм (необязательно)',
      'Refresh token': 'Токен обновления',
      'Access token (optional)': 'Токен доступа (необязательно)',
      'Scopes (optional)': 'Области доступа (необязательно)',
      'Cancel': 'Отмена',
      'Connecting…': 'Подключаем…',
      'Remove language assignment?': 'Удалить назначение языка?',
      'Remove': 'Удалить',
      'Disconnect channel?': 'Отключить канал?',
      'Disconnecting…': 'Отключаем…',
      'Revoke channel tokens?': 'Отозвать токены канала?',
      'Revoking…': 'Отзываем…',
      'Revoke': 'Отозвать',
    };
    return map[en] ?? en;
  };

  const [state, setState] = useState<SchedulerStateDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [cadence, setCadence] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [channelAssignments, setChannelAssignments] = useState<Record<string, string[]>>({});
  const [pendingRemoval, setPendingRemoval] = useState<{ channelId: string; languageCode: string } | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<{ channelId: string; label: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<{ channelId: string; label: string } | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [channelForm, setChannelForm] = useState({
    provider: 'youtube' as 'youtube',
    channelId: '',
    displayName: '',
    handle: '',
    refreshToken: '',
    accessToken: '',
    scopes: '',
  });
  const [oauthLoading, setOauthLoading] = useState(false);

  const applyState = useCallback((data: SchedulerStateDTO) => {
    setState(data);
    if (data.enabled && data.defaults) {
      setTimes(data.defaults.times ?? {});
      setCadence(data.defaults.cadence ?? {});
    } else {
      setTimes({});
      setCadence({});
    }
    const channels = data.channels ?? [];
    setChannelAssignments(
      Object.fromEntries(channels.map((channel) => [channel.id, channel.languages.map((code) => code.toLowerCase())])),
    );
  }, []);

  const refreshState = useCallback(async () => {
    const data = await Api.getSchedulerState();
    applyState(data);
  }, [applyState]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await Api.getSchedulerState();
        if (cancelled) return;
        applyState(data);
      } catch (err) {
        console.error('Failed to load scheduler state', err);
        toast.error(tr('Failed to load scheduler settings'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applyState]);

  const languages = useMemo(() => LANGUAGES.map((lang) => ({ ...lang, codeLower: lang.code.toLowerCase() })), []);
  const languageLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    languages.forEach((lang) => { map.set(lang.codeLower, lang.label); });
    return map;
  }, [languages]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{tr('Publisher schedule')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-6 w-36 rounded bg-muted animate-pulse" />
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="h-8 rounded bg-muted animate-pulse" />
                <div className="h-8 rounded bg-muted animate-pulse" />
                <div className="h-8 rounded bg-muted animate-pulse" />
                <div className="h-8 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!state?.enabled) return null;

  const saveDefaults = async () => {
    setSaving(true);
    try {
      const result = await Api.updateSchedulerState({ defaultTimes: times, cadence: cadence as any });
      setState(result);
      toast.success(tr('Scheduler defaults updated'));
    } catch (err) {
      console.error(err);
      toast.error(tr('Failed to update scheduler defaults'));
    } finally {
      setSaving(false);
    }
  };

  const schedule = async () => {
    setSaving(true);
    try {
      const payload = Object.entries(overrides)
        .filter(([, channelId]) => channelId)
        .map(([languageCode, channelId]) => ({ languageCode, channelId }));
      const result = await Api.scheduleProject(projectId, payload.length ? { languages: payload } : undefined);
      toast.success(
        result.scheduled > 0
          ? (language === 'ru' ? `Запланировано публикаций: ${result.scheduled}` : `Scheduled ${result.scheduled} uploads`)
          : tr('Nothing scheduled'),
      );
    } catch (err) {
      console.error(err);
      toast.error(tr('Failed to schedule project'));
    } finally {
      setSaving(false);
    }
  };

  const toggleChannelLanguage = (channelId: string, languageCode: string, enabled: boolean) => {
    if (!enabled) {
      setPendingRemoval({ channelId, languageCode });
      return;
    }
    setChannelAssignments((prev) => {
      const current = new Set(prev[channelId] ?? []);
      current.add(languageCode);
      return { ...prev, [channelId]: Array.from(current) };
    });
  };

  const confirmRemoval = () => {
    if (!pendingRemoval) return;
    setChannelAssignments((prev) => {
      const current = new Set(prev[pendingRemoval.channelId] ?? []);
      current.delete(pendingRemoval.languageCode);
      return { ...prev, [pendingRemoval.channelId]: Array.from(current) };
    });
    setPendingRemoval(null);
  };

  const cancelRemoval = () => setPendingRemoval(null);

  const requestDisconnectChannel = (channelId: string, label: string) => {
    setPendingDisconnect({ channelId, label });
  };

  const confirmDisconnectChannel = async () => {
    if (!pendingDisconnect) return;
    setDisconnecting(true);
    try {
      await Api.deleteSchedulerChannel(pendingDisconnect.channelId);
      await refreshState();
      toast.success(tr('Channel disconnected'));
    } catch (err) {
      console.error(err);
      toast.error(tr('Failed to disconnect channel'));
    } finally {
      setDisconnecting(false);
      setPendingDisconnect(null);
    }
  };

  const cancelDisconnectChannel = () => {
    if (disconnecting) return;
    setPendingDisconnect(null);
  };

  const requestRevokeChannel = (channelId: string, label: string) => {
    setPendingRevoke({ channelId, label });
  };

  const confirmRevokeChannel = async () => {
    if (!pendingRevoke) return;
    setRevoking(true);
    try {
      await Api.revokeSchedulerChannel(pendingRevoke.channelId);
      await refreshState();
      toast.success(tr('Channel tokens revoked'));
    } catch (err) {
      console.error(err);
      toast.error(tr('Failed to revoke channel tokens'));
    } finally {
      setRevoking(false);
      setPendingRevoke(null);
    }
  };

  const cancelRevokeChannel = () => {
    if (revoking) return;
    setPendingRevoke(null);
  };

  const resetChannelForm = () => {
    setChannelForm({
      provider: 'youtube',
      channelId: '',
      displayName: '',
      handle: '',
      refreshToken: '',
      accessToken: '',
      scopes: '',
    });
  };

  const openConnectDialog = () => {
    setConnectDialogOpen(true);
  };

  const closeConnectDialog = () => {
    if (connecting) return;
    setConnectDialogOpen(false);
    resetChannelForm();
  };

  const handleLaunchOAuthDocs = () => {
    if (typeof window === 'undefined') return;
    window.open('https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps', '_blank', 'noopener,noreferrer');
  };

  const submitChannelConnection = async () => {
    setConnecting(true);
    try {
      await Api.createSchedulerChannel({
        provider: 'youtube',
        channelId: channelForm.channelId.trim(),
        displayName: channelForm.displayName.trim() || undefined,
        handle: channelForm.handle.trim() || undefined,
        refreshToken: channelForm.refreshToken.trim() || undefined,
        accessToken: channelForm.accessToken.trim() || undefined,
        scopes: channelForm.scopes.trim() || undefined,
      });
      toast.success(tr('Channel connected'));
      await refreshState();
      closeConnectDialog();
    } catch (err) {
      console.error(err);
      toast.error(tr('Failed to connect channel'));
    } finally {
      setConnecting(false);
    }
  };

  const connectFormValid = channelForm.channelId.trim().length > 0;

  const startOauthFlow = async () => {
    setOauthLoading(true);
    try {
      const { authUrl } = await Api.startSchedulerChannelOAuth();
      window.location.href = authUrl;
    } catch (err) {
      console.error(err);
      toast.error(tr('Failed to start Google OAuth'));
    } finally {
      setOauthLoading(false);
    }
  };

  const saveChannelAssignments = async () => {
    setSaving(true);
    try {
      const payload = Object.entries(channelAssignments).map(([channelId, languages]) => ({
        channelId,
        languages: (languages ?? []).filter((code): code is string => typeof code === 'string' && code.length > 0),
      }));
      const result = await Api.updateSchedulerState({ channelLanguages: payload });
      setState(result);
      setChannelAssignments(
        Object.fromEntries(
          result.channels.map((channel) => [channel.id, channel.languages.map((code) => code.toLowerCase())]),
        ),
      );
      toast.success(tr('Channel assignments updated'));
    } catch (err) {
      console.error(err);
      toast.error(tr('Failed to update channel assignments'));
    } finally {
      setSaving(false);
    }
  };

  return (
      <Card>
      <CardHeader>
        <CardTitle>{tr('Publisher schedule')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-semibold text-muted-foreground">
          <span>{tr('Language')}</span>
          <span>{tr('Default time (UTC)')}</span>
          <span>{tr('Cadence')}</span>
          <span>{tr('Channel override')}</span>
        </div>
        <div className="space-y-3">
          {languages.map((lang) => {
            const timeValue = times[lang.codeLower] ?? '';
            const cadenceValue = cadence[lang.codeLower] ?? 'every_3_days';
            const overrideValue = overrides[lang.codeLower] ?? '';
            return (
              <div key={lang.code} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                <div className="font-medium">{lang.label}</div>
                <Input
                  value={timeValue}
                  onChange={(event) => setTimes((prev) => ({ ...prev, [lang.codeLower]: event.target.value }))}
                  placeholder="HH:MM"
                />
                <Select value={cadenceValue} onValueChange={(value) => setCadence((prev) => ({ ...prev, [lang.codeLower]: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={tr('Cadence')} />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULER_CADENCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={overrideValue} onValueChange={(value) => setOverrides((prev) => ({ ...prev, [lang.codeLower]: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={tr('Auto')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{tr('Auto')}</SelectItem>
                    {state.channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>{channel.displayName || channel.channelId}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={saveDefaults} disabled={saving}>{tr('Save defaults')}</Button>
          <Button variant="secondary" onClick={schedule} disabled={saving}>{tr('Schedule project')}</Button>
        </div>
        <div className="border-t border-border my-4" />
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">{tr('Channel assignments')}</div>
            <Button size="sm" variant="outline" onClick={openConnectDialog}>{tr('Connect channel')}</Button>
          </div>
          {state.channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr('Connect a channel to enable auto publishing.')}</p>
          ) : (
            state.channels.map((channel) => (
              <div key={channel.id} className="rounded border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{channel.displayName || channel.channelId}</div>
                    <div className="text-xs text-muted-foreground">{tr('Provider')}: {channel.provider}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => requestRevokeChannel(channel.id, channel.displayName || channel.channelId)}
                      disabled={revoking}
                    >
                      {tr('Revoke access')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => requestDisconnectChannel(channel.id, channel.displayName || channel.channelId)}
                      disabled={disconnecting}
                    >
                      {tr('Disconnect')}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {languages.map((lang) => {
                    const checked = channelAssignments[channel.id]?.includes(lang.codeLower) ?? false;
                    return (
                      <label key={`${channel.id}-${lang.code}`} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={checked}
                          onChange={(event) => toggleChannelLanguage(channel.id, lang.codeLower, event.target.checked)}
                        />
                        <span>{lang.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          <Button onClick={saveChannelAssignments} disabled={saving || state.channels.length === 0} variant="outline">
            {tr('Save channel assignments')}
          </Button>
        </div>
      </CardContent>
      <Dialog open={connectDialogOpen} onOpenChange={(open) => {
        if (!open) closeConnectDialog();
        else setConnectDialogOpen(true);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr('Connect a channel')}</DialogTitle>
            <DialogDescription>
              {tr('Use your YouTube (Shorts) brand account. Run through the OAuth flow, then paste the resulting tokens so YumCut can schedule uploads.')}
            </DialogDescription>
          </DialogHeader>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={startOauthFlow} disabled={oauthLoading}>
              {oauthLoading ? tr('Redirecting…') : tr('Connect with Google')}
            </Button>
            <span className="text-xs text-muted-foreground">{tr('Prefer manual entry? Fill the fields below.')}</span>
          </div>
          <div className="space-y-3 text-sm">
            <Button type="button" variant="secondary" size="sm" onClick={handleLaunchOAuthDocs}>
              {tr('Open OAuth instructions')}
            </Button>
            <div className="grid gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{tr('Provider')}</span>
                <Select value={channelForm.provider} disabled>
                  <SelectTrigger>
                    <SelectValue placeholder={tr('Select provider')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="youtube">YouTube</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{tr('Channel ID')}</span>
                <Input value={channelForm.channelId} onChange={(event) => setChannelForm((prev) => ({ ...prev, channelId: event.target.value }))} placeholder="UC…" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{tr('Display name')}</span>
                <Input value={channelForm.displayName} onChange={(event) => setChannelForm((prev) => ({ ...prev, displayName: event.target.value }))} placeholder="YumCut Labs" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{tr('Handle (optional)')}</span>
                <Input value={channelForm.handle} onChange={(event) => setChannelForm((prev) => ({ ...prev, handle: event.target.value }))} placeholder="@yumcut" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{tr('Refresh token')}</span>
                <Textarea value={channelForm.refreshToken} onChange={(event) => setChannelForm((prev) => ({ ...prev, refreshToken: event.target.value }))} rows={3} placeholder="ya29.a0AWY…" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{tr('Access token (optional)')}</span>
                <Textarea value={channelForm.accessToken} onChange={(event) => setChannelForm((prev) => ({ ...prev, accessToken: event.target.value }))} rows={3} placeholder="ya29.a0AVv…" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{tr('Scopes (optional)')}</span>
                <Input value={channelForm.scopes} onChange={(event) => setChannelForm((prev) => ({ ...prev, scopes: event.target.value }))} placeholder="https://www.googleapis.com/auth/youtube.upload" />
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={closeConnectDialog} disabled={connecting}>{tr('Cancel')}</Button>
            <Button onClick={submitChannelConnection} disabled={!connectFormValid || connecting}>
              {connecting ? tr('Connecting…') : tr('Connect channel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(pendingRemoval)} onOpenChange={(open) => { if (!open) cancelRemoval(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr('Remove language assignment?')}</DialogTitle>
            <DialogDescription>
              {pendingRemoval ? (
                <>
                  {language === 'ru' ? 'Язык ' : 'This will unassign '}
                  {languageLabelMap.get(pendingRemoval.languageCode) ?? pendingRemoval.languageCode.toUpperCase()}
                  {language === 'ru' ? ' будет снят с канала ' : ' from '}
                  {state.channels.find((c) => c.id === pendingRemoval.channelId)?.displayName || state.channels.find((c) => c.id === pendingRemoval.channelId)?.channelId || (language === 'ru' ? 'этот канал' : 'this channel')}
                  {language === 'ru' ? '.' : '.'}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={cancelRemoval}>{tr('Cancel')}</Button>
            <Button variant="destructive" onClick={confirmRemoval}>{tr('Remove')}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(pendingDisconnect)} onOpenChange={(open) => { if (!open) cancelDisconnectChannel(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr('Disconnect channel?')}</DialogTitle>
            <DialogDescription>
              {pendingDisconnect ? (
                <>
                  {language === 'ru'
                    ? `Канал (${pendingDisconnect.label}) потеряет доступ к запланированным публикациям, пока вы не подключите его снова.`
                    : `This channel (${pendingDisconnect.label}) will lose access to scheduled uploads until you reconnect it.`}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={cancelDisconnectChannel} disabled={disconnecting}>{tr('Cancel')}</Button>
            <Button variant="destructive" onClick={confirmDisconnectChannel} disabled={disconnecting}>
              {disconnecting ? tr('Disconnecting…') : tr('Disconnect')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(pendingRevoke)} onOpenChange={(open) => { if (!open) cancelRevokeChannel(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr('Revoke channel tokens?')}</DialogTitle>
            <DialogDescription>
              {pendingRevoke ? (
                <>
                  {language === 'ru'
                    ? `Сохранённые OAuth-токены для ${pendingRevoke.label} будут удалены. Чтобы снова планировать публикации, канал нужно переподключить.`
                    : `This will remove stored OAuth tokens for ${pendingRevoke.label}. The channel will need to reconnect before new uploads can be scheduled.`}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={cancelRevokeChannel} disabled={revoking}>{tr('Cancel')}</Button>
            <Button variant="destructive" onClick={confirmRevokeChannel} disabled={revoking}>
              {revoking ? tr('Revoking…') : tr('Revoke') }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
