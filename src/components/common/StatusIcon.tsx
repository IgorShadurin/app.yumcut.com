"use client";
import { ProjectStatus } from '@/shared/constants/status';
import { CheckCircle2, Clock, Edit3, FileText, AudioLines, Headphones, Image as ImageIcon, Film, Clapperboard, AlertTriangle, XCircle, Subtitles, Sparkles } from 'lucide-react';

export function StatusIcon({ status, size = 16, className }: { status: ProjectStatus | string; size?: number; className?: string }) {
  const s = status as ProjectStatus;
  // Light color palette mapping for statuses
  const map: Record<ProjectStatus, { icon: any; className: string }> = {
    [ProjectStatus.New]: { icon: Clock, className: 'text-orange-400' }, // waiting/queued
    [ProjectStatus.ProcessScript]: { icon: FileText, className: 'text-blue-400' },
    [ProjectStatus.ProcessScriptValidate]: { icon: Edit3, className: 'text-indigo-400' },
    [ProjectStatus.ProcessAudio]: { icon: AudioLines, className: 'text-amber-400' },
    [ProjectStatus.ProcessAudioValidate]: { icon: Headphones, className: 'text-yellow-400' },
    [ProjectStatus.ProcessTranscription]: { icon: Subtitles, className: 'text-teal-400' },
    [ProjectStatus.ProcessMetadata]: { icon: Sparkles, className: 'text-rose-400' },
    [ProjectStatus.ProcessCaptionsVideo]: { icon: Subtitles, className: 'text-fuchsia-400' },
    [ProjectStatus.ProcessImagesGeneration]: { icon: ImageIcon, className: 'text-lime-500' },
    [ProjectStatus.ProcessVideoPartsGeneration]: { icon: Film, className: 'text-purple-400' },
    [ProjectStatus.ProcessVideoMain]: { icon: Clapperboard, className: 'text-cyan-400' },
    [ProjectStatus.Error]: { icon: AlertTriangle, className: 'text-red-400' },
    [ProjectStatus.Done]: { icon: CheckCircle2, className: 'text-green-400' },
    [ProjectStatus.Cancelled]: { icon: XCircle, className: 'text-gray-400' },
  };
  const Cmp = map[s]?.icon || Clock;
  const tone = map[s]?.className || 'text-slate-400';
  const base = 'shrink-0 block align-middle';
  return <Cmp size={size} className={`${base} ${tone} ${className || ''}`} aria-hidden="true" />;
}
