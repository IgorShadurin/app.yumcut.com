import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type ScriptPreviewProps = {
  label: string;
  characterCount: number;
  text: string;
};

const CHARACTERS_LABEL: Record<AppLanguageCode, string> = {
  en: 'characters',
  ru: 'символов',
};

export function ScriptPreview({ label, characterCount, text }: ScriptPreviewProps) {
  const { language } = useAppLanguage();
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';

  return (
    <section className="space-y-2">
      <ScrollArea className="max-h-[260px] rounded-md border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
        <div className="relative px-4 pb-4 pt-6">
          <div className="absolute left-4 top-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {label}
          </div>
          <span className="absolute right-4 top-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {characterCount.toLocaleString(locale)} {CHARACTERS_LABEL[language]}
          </span>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">{text}</p>
        </div>
      </ScrollArea>
    </section>
  );
}
