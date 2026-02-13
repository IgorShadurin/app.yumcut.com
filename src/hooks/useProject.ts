import { useCallback, useEffect, useRef, useState } from 'react';
import { Api } from '@/lib/api-client';
import { usePoll } from './usePoll';
import { ProjectStatus } from '@/shared/constants/status';

export function useProject(projectId: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const lastStatusRef = useRef<string | null>(null);

  const fetchOne = useCallback(async () => {
    try {
      const res = await Api.getProject(projectId);
      setData(res);
      const nextStatus = (res as any)?.status ?? null;
      const shouldBroadcast = typeof nextStatus === 'string' && lastStatusRef.current !== nextStatus;
      lastStatusRef.current = nextStatus;
      if (shouldBroadcast && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('project:updated', {
          detail: { id: projectId, status: nextStatus, title: (res as any)?.title },
        }));
      }
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchOne();
  }, [fetchOne]);

  useEffect(() => {
    lastStatusRef.current = null;
  }, [projectId]);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await Api.getProjectStatus(projectId);
      const previous = lastStatusRef.current;
      const statusChanged = previous !== s.status;
      let infoChanged = false;
      setData((prev: any) => {
        if (!prev) return prev;
        infoChanged = JSON.stringify(prev.statusInfo) !== JSON.stringify(s.statusInfo);
        const sameStatus = prev.status === s.status;
        if (sameStatus && !infoChanged) return prev;
        return { ...prev, status: s.status, statusInfo: s.statusInfo, updatedAt: s.updatedAt };
      });
      if (statusChanged && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('project:updated', { detail: { id: projectId, status: s.status } }));
      }
      if (statusChanged || infoChanged) {
        lastStatusRef.current = s.status ?? null;
        try {
          const full = await Api.getProject(projectId);
          setData(full);
          lastStatusRef.current = (full as any)?.status ?? s.status ?? null;
        } catch (_) {
          // ignore additional fetch errors to keep polling resilient
        }
      }
    } catch (e) {
      // Do not override main error state with polling errors
    }
  }, [projectId]);

  // Keep polling even on Error to allow automatic recovery when status changes.
  const stopOn: ProjectStatus[] = [ProjectStatus.Done, ProjectStatus.Cancelled];
  const pollingEnabled = data ? !stopOn.includes(data.status as ProjectStatus) : true;
  usePoll(fetchStatus, { intervalMs: 3000, enabled: pollingEnabled });

  // React to optimistic project updates from anywhere in the app
  useEffect(() => {
    function onUpdated(e: any) {
      const { id, status, title, finalScriptText } = e?.detail || {};
      if (!id || id !== projectId) return;
      if (typeof status === 'string') {
        lastStatusRef.current = status;
      }
      setData((prev: any) => prev ? ({
        ...prev,
        status: status ?? prev.status,
        title: title ?? prev.title,
        finalScriptText: finalScriptText ?? prev.finalScriptText,
      }) : prev);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('project:updated', onUpdated as any);
      return () => window.removeEventListener('project:updated', onUpdated as any);
    }
  }, [projectId]);

  return { project: data, loading, error, refresh: fetchOne };
}
