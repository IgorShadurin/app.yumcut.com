"use client";
import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { User } from 'lucide-react';
import { AccountMenuContent } from '@/components/layout/AccountMenuContent';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';

export function HeaderAccountMenu() {
  const { language } = useAppLanguage();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const displayName = useMemo(() => {
    const n = (session?.user?.name || '').trim();
    if (n) {
      const parts = n.split(/\s+/);
      return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0];
    }
    const email = session?.user?.email || '';
    return email ? email.split('@')[0] : (language === 'ru' ? 'Аккаунт' : 'Account');
  }, [language, session?.user?.name, session?.user?.email]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={language === 'ru' ? 'Меню аккаунта' : 'Account menu'}
          title={displayName}
          className="rounded-full"
        >
          <User className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(320px,calc(100vw-1rem))] p-0">
        <AccountMenuContent />
      </PopoverContent>
    </Popover>
  );
}
