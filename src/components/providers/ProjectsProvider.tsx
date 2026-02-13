"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Api } from '@/lib/api-client';

type ProjectItem = any;

type ProjectsContextValue = {
  items: ProjectItem[];
  loading: boolean;
  refresh: () => void;
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    Api.getProjects()
      .then((r: any) => setItems(Array.isArray(r) ? r : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Prefetch immediately on first client render to avoid popover delay
    refresh();
  }, [refresh]);

  useEffect(() => {
    // Keep in sync with app-level events
    function onDeleted(e: any) {
      const id = e?.detail?.projectId;
      if (!id) return;
      setItems((prev) => prev.filter((it) => it.id !== id));
    }
    function onUpdated(e: any) {
      const { id, status, title } = e?.detail || {};
      if (!id) return;
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: status ?? it.status, title: title ?? it.title } : it)));
    }
    function onCreated(e: any) {
      const item = e?.detail;
      if (!item || !item.id) return;
      setItems((prev) => (prev.some((p) => p.id === item.id) ? prev : [item, ...prev]));
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('project:deleted', onDeleted as any);
      window.addEventListener('project:updated', onUpdated as any);
      window.addEventListener('project:created', onCreated as any);
      return () => {
        window.removeEventListener('project:deleted', onDeleted as any);
        window.removeEventListener('project:updated', onUpdated as any);
        window.removeEventListener('project:created', onCreated as any);
      };
    }
  }, []);

  const value = useMemo<ProjectsContextValue>(() => ({ items, loading, refresh }), [items, loading, refresh]);

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) return { items: [] as ProjectItem[], loading: true, refresh: () => {} } satisfies ProjectsContextValue;
  return ctx;
}

