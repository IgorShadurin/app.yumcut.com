"use client";
import { useEffect, useState } from 'react';
import { Api } from '@/lib/api-client';
import Link from 'next/link';
import { StatusIcon } from './StatusIcon';

type Props = {
  items?: any[];
  fetchOnMount?: boolean;
};

export function ProjectList({ items: controlledItems, fetchOnMount = true }: Props) {
  const controlled = Array.isArray(controlledItems);
  const [items, setItems] = useState<any[]>(controlled ? (controlledItems as any[]) : []);

  // Keep derived items in sync when controlled
  useEffect(() => {
    if (controlled) setItems(controlledItems as any[]);
  }, [controlled, controlledItems]);

  useEffect(() => {
    if (controlled || !fetchOnMount) return;
    Api.getProjects().then((r: any) => setItems(r)).catch(() => setItems([]));
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
    function onDeleted(e: any) {
      const id = e?.detail?.projectId;
      if (!id) return;
      setItems((prev) => prev.filter((it) => it.id !== id));
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('project:updated', onUpdated as any);
      window.addEventListener('project:created', onCreated as any);
      window.addEventListener('project:deleted', onDeleted as any);
      return () => {
        window.removeEventListener('project:updated', onUpdated as any);
        window.removeEventListener('project:created', onCreated as any);
        window.removeEventListener('project:deleted', onDeleted as any);
      };
    }
  }, [controlled, fetchOnMount]);

  return (
    <ul>
      {items.map((p) => (
        <li key={p.id}>
          <Link
            href={`/project/${p.id}`}
            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-900 min-w-0"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('project:list-clicked'));
              }
            }}
          >
            <div className="shrink-0">
              <StatusIcon status={p.status} />
            </div>
            <span className="truncate flex-1">{p.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
