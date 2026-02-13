import { Tooltip } from '@/components/common/Tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { GuidanceSection } from './types';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type GuidancePromptsProps = {
  sections: GuidanceSection[];
};

type GuidancePromptsCopy = {
  title: string;
  creationTooltip: string;
  avoidanceTooltip: string;
  audioTooltip: string;
};

const COPY: Record<AppLanguageCode, GuidancePromptsCopy> = {
  en: {
    title: 'Guidance prompts',
    creationTooltip: 'Gives the AI guidance on how the video script should be written, including intro, outro, and other sections.',
    avoidanceTooltip: 'Lists what the AI should avoid when writing the script.',
    audioTooltip: 'Shapes the AI-generated voiceover style.',
  },
  ru: {
    title: 'Подсказки для генерации',
    creationTooltip: 'Подсказывает ИИ, как писать сценарий: вступление, структура и финал.',
    avoidanceTooltip: 'Показывает, чего ИИ должен избегать при написании сценария.',
    audioTooltip: 'Формирует стиль озвучки, которую генерирует ИИ.',
  },
};

export function GuidancePrompts({ sections }: GuidancePromptsProps) {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  if (sections.length === 0) return null;

  return (
    <section className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
      <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">{copy.title}</h2>
      {sections.map((item) => (
        <Tooltip
          key={item.key}
          content={
            item.key === 'creation'
              ? copy.creationTooltip
              : item.key === 'avoidance'
              ? copy.avoidanceTooltip
              : copy.audioTooltip
          }
        >
          <div
            className={cn(
              'flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 transition dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100',
              item.hoverClass,
            )}
          >
            <div className={cn('flex h-9 w-9 items-center justify-center rounded-full', item.iconClass)}>
              <item.icon className="h-4 w-4" />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <span className="font-medium">{item.label}</span>
              <div className="flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <ScrollArea className="max-h-32 rounded-md border border-gray-200 bg-white/60 p-3 text-sm leading-relaxed text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
                <p className="whitespace-pre-wrap">{item.text}</p>
              </ScrollArea>
            </div>
          </div>
        </Tooltip>
      ))}
    </section>
  );
}
