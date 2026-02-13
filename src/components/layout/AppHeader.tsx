"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { APP_NAME } from '@/shared/constants/app';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FolderOpen } from 'lucide-react';
import { ProjectList } from '@/components/common/ProjectList';
import { useProjects } from '@/components/providers/ProjectsProvider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HeaderAccountMenu } from '@/components/layout/HeaderAccountMenu';
import { cn } from '@/lib/utils';

export function AppHeader() {
  const { items, loading } = useProjects();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const hideAccountMenuOnDesktop = pathname === '/';

  useEffect(() => {
    function handleProjectSelect() {
      setOpen(false);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('project:list-clicked', handleProjectSelect as any);
      return () => window.removeEventListener('project:list-clicked', handleProjectSelect as any);
    }
  }, []);
  return (
    <header className="w-full border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {/* Mobile projects access */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open projects"
            >
              <FolderOpen className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="w-[min(420px,calc(100vw-1rem))] p-0">
            <div className="border-b border-gray-200 dark:border-gray-800 px-3 py-2 text-sm font-medium">
              Projects
            </div>
            <ScrollArea className="h-[70vh] overscroll-contain pr-2">
              {loading && items.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Loading…</div>
              ) : items.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-600 dark:text-gray-300">
                  <div>No projects yet.</div>
                </div>
              ) : (
                <ProjectList items={items} fetchOnMount={false} />
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>
        <Link href="/" className="font-semibold tracking-tight">
          {APP_NAME}
        </Link>
      </div>
      <div className={cn('flex items-center gap-1', hideAccountMenuOnDesktop && 'md:hidden')}>
        <HeaderAccountMenu />
      </div>
    </header>
  );
}
