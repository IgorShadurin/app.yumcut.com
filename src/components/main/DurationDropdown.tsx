"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip } from '@/components/common/Tooltip';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type Props = {
  value: number;
  onChange: (v: number) => void;
  options?: number[];
  customLabels?: Partial<Record<number, string>>;
  disabled?: boolean;
  tooltipWhenDisabled?: string;
};

const DEFAULT_OPTIONS = [30, 60, 90, 120];

const COPY: Record<AppLanguageCode, {
  approximateDuration: string;
  exactScriptDurationNa: string;
  videoDuration: string;
  durationPlaceholder: string;
  na: string;
}> = {
  en: {
    approximateDuration: 'Approximate video duration',
    exactScriptDurationNa: 'Exact script mode: duration is N/A; timing comes from script',
    videoDuration: 'Video duration',
    durationPlaceholder: 'Duration',
    na: 'N/A',
  },
  ru: {
    approximateDuration: 'Примерная длительность видео',
    exactScriptDurationNa: 'Режим сценария: длительность недоступна; тайминг берется из текста',
    videoDuration: 'Длительность видео',
    durationPlaceholder: 'Длительность',
    na: 'Н/Д',
  },
};

function format(sec: number) {
  return sec === 30 ? '30s' : sec === 60 ? '1:00' : sec === 90 ? '1:30' : '2:00';
}

function getDisplayLabel(sec: number, customLabels?: Partial<Record<number, string>>) {
  return customLabels?.[sec] ?? format(sec);
}

export function DurationDropdown({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  customLabels,
  disabled,
  tooltipWhenDisabled,
}: Props) {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const tooltip = disabled
    ? (tooltipWhenDisabled || copy.exactScriptDurationNa)
    : copy.approximateDuration;
  const hasMultipleOptions = options.length > 1;
  const selectedValue = options.includes(value) ? value : options[0] ?? DEFAULT_OPTIONS[0];

  if (!hasMultipleOptions) {
    return (
      <Tooltip content={tooltip}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-full px-3"
          disabled={disabled}
          aria-label={copy.videoDuration}
        >
          <Clock className="h-3.5 w-3.5 opacity-70" />
          <span className="ml-1">{disabled ? copy.na : getDisplayLabel(selectedValue, customLabels)}</span>
        </Button>
      </Tooltip>
    );
  }

  return (
    <Select value={String(selectedValue)} onValueChange={(v) => onChange(parseInt(v, 10))}>
      <Tooltip content={tooltip}>
        <SelectTrigger className="w-[96px] h-8 text-sm" disabled={disabled}>
          <div className="flex items-center gap-1">
            {disabled ? (
              <span className="text-gray-500">{copy.na}</span>
            ) : (
              <SelectValue placeholder={copy.durationPlaceholder} />
            )}
          </div>
        </SelectTrigger>
      </Tooltip>
      <SelectContent>
        {options.map((sec) => (
          <SelectItem key={sec} value={String(sec)}>
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 opacity-70" />
              <span>{getDisplayLabel(sec, customLabels)}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
