import type { ProjectDetailDTO } from '@/shared/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Props = { creation: ProjectDetailDTO['creation'] };

function formatDuration(sec?: number | null) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

export function ProjectSettingsCard({ creation }: Props) {
  const d = creation || {};
  const char = d.characterSelection;
  const selectionSource = (char as any)?.source ?? char?.type ?? null;
  const hasSelection = !!char;
  const charTone = selectionSource === 'user' ? 'info' : 'default';
  const badgeLabel =
    (char as any)?.badgeLabel
    ?? (selectionSource === 'user' ? 'My character' : selectionSource === 'global' ? 'Public character' : selectionSource === 'dynamic' ? 'Auto character' : null);
  const rawDisplayLabel = typeof (char as any)?.displayLabel === 'string' ? ((char as any).displayLabel as string).trim() : null;
  const displayLabel = rawDisplayLabel && rawDisplayLabel.length > 0 ? rawDisplayLabel : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Settings</CardTitle>
        <Badge variant="info">9:16</Badge>
      </CardHeader>
      <CardContent>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500 w-36 shrink-0">Approx Duration</div>
          <Badge>{formatDuration(d.durationSeconds ?? null)}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500 w-36 shrink-0">Text handling</div>
          {d.useExactTextAsScript ? (
            <Badge variant="success">Exact script</Badge>
          ) : (
            <Badge>Generate from prompt</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500 w-36 shrink-0">Music</div>
          {d.includeDefaultMusic == null ? <Badge>—</Badge> : d.includeDefaultMusic ? <Badge variant="success">On</Badge> : <Badge variant="danger">Off</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500 w-36 shrink-0">Overlay</div>
          {d.addOverlay == null ? <Badge>—</Badge> : d.addOverlay ? <Badge variant="success">On</Badge> : <Badge variant="danger">Off</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500 w-36 shrink-0">Watermark</div>
          {(d.watermarkEnabled ?? true)
            ? <Badge variant="success">On</Badge>
            : <Badge variant="danger">Off</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500 w-36 shrink-0">Captions</div>
          {(d.captionsEnabled ?? true)
            ? <Badge variant="success">On</Badge>
            : <Badge variant="danger">Off</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500 w-36 shrink-0">Call to Action</div>
          {(d.includeCallToAction ?? true)
            ? <Badge variant="success">On</Badge>
            : <Badge variant="danger">Off</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500 w-36 shrink-0">Auto-approve script</div>
          {d.autoApproveScript == null ? <Badge>—</Badge> : d.autoApproveScript ? <Badge variant="success">On</Badge> : <Badge variant="danger">Off</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500 w-36 shrink-0">Auto-approve audio</div>
          {d.autoApproveAudio == null ? <Badge>—</Badge> : d.autoApproveAudio ? <Badge variant="success">On</Badge> : <Badge variant="danger">Off</Badge>}
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <div className="text-sm text-gray-500 w-36 shrink-0">Character</div>
          {hasSelection ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={charTone as any}>{badgeLabel || 'Character selected'}</Badge>
              {displayLabel && displayLabel !== badgeLabel ? (
                <span className="text-sm text-gray-700 dark:text-gray-200">{displayLabel}</span>
              ) : null}
            </div>
          ) : (
            <Badge>None</Badge>
          )}
        </div>
      </div>
      </CardContent>
    </Card>
  );
}
