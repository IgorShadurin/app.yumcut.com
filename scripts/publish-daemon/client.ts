import { PublishDaemonConfig } from './config';
import type { SchedulerTasksResponse } from './types';

function buildUrl(base: string, path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, base).toString();
}

export class SchedulerApiClient {
  constructor(private cfg: PublishDaemonConfig) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.cfg.requestTimeoutMs);
    try {
      const res = await fetch(buildUrl(this.cfg.apiBaseUrl, path), {
        ...init,
        headers: {
          'content-type': 'application/json',
          'x-daemon-password': this.cfg.apiPassword,
          'x-daemon-id': this.cfg.daemonId,
          ...(init?.headers || {}),
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Scheduler API request failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as T;
      return json;
    } finally {
      clearTimeout(timeout);
    }
  }

  fetchTasks(limit: number, status: 'pending' | 'cleanup' = 'pending') {
    const params = new URLSearchParams({ limit: String(limit), status });
    return this.request<SchedulerTasksResponse>(`/api/scheduler/tasks?${params.toString()}`);
  }

  updateTask(taskId: string, payload: Record<string, unknown>) {
    return this.request<{ updated: boolean }>(`/api/scheduler/tasks/${taskId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  completeCleanup(taskId: string, payload: { status: 'done' | 'failed'; error?: string }) {
    return this.request<{ updated: boolean }>(`/api/scheduler/tasks/${taskId}/cleanup`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}
