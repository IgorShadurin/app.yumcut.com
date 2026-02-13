"use client";
import { use, useEffect, useMemo, useState } from 'react';
import { Api } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminBackButton } from '@/components/admin/AdminBackButton';
import { type AdminEntity, schemaFor } from '@/shared/validators/templates';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { formatDateTimeAdmin } from '@/lib/date';
import { Loader2, Lock, Globe, Save, Trash2 } from 'lucide-react';

const TITLES: Record<Exclude<AdminEntity, 'templates'> | 'templates', string> = {
  'templates': 'Video Template',
  'art-styles': 'Art Style',
  'voice-styles': 'Voice Style',
  'voices': 'Voice',
  'music': 'Music',
  'captions-styles': 'Captions Style',
  'overlays': 'Overlay',
};

export default function ManageEntityItemPage({ params }: { params: Promise<{ entity: AdminEntity; id: string }> }) {
  const { entity, id } = use(params);
  const title = TITLES[entity] || 'Item';
  const schema = useMemo(() => schemaFor(entity), [entity]);
  const [item, setItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Related lists for templates
  const NONE = '__none__';
  const [artStyles, setArtStyles] = useState<any[]>([]);
  const [voiceStyles, setVoiceStyles] = useState<any[]>([]);
  const [voices, setVoices] = useState<any[]>([]);
  const [music, setMusic] = useState<any[]>([]);
  const [captions, setCaptions] = useState<any[]>([]);
  const [overlays, setOverlays] = useState<any[]>([]);
  const [refsLoading, setRefsLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Api.adminTemplatesGet(entity, id)
      .then((r: any) => {
        setItem(r);
        const { id: _id, createdAt, updatedAt, ownerId, ...rest } = (r || {}) as any;
        // Normalize null -> undefined so validators (which expect string or undefined) succeed
        const normalized: any = {};
        Object.entries(rest || {}).forEach(([k, v]) => {
          if (k === 'weight') {
            if (v === null || v === undefined) {
              normalized[k] = '';
            } else {
              normalized[k] = String(v);
            }
            return;
          }
          normalized[k] = v === null ? undefined : v;
        });
        if (normalized.weight === undefined) {
          normalized.weight = '';
        }
        setForm(normalized);
      })
      .finally(() => setLoading(false));
    if (entity === 'templates') {
      setRefsLoading(true);
      Promise.all([
        Api.adminTemplatesList('art-styles'),
        Api.adminTemplatesList('voice-styles'),
        Api.adminTemplatesList('voices'),
        Api.adminTemplatesList('music'),
        Api.adminTemplatesList('captions-styles'),
        Api.adminTemplatesList('overlays'),
      ]).then(([as, vsStyles, vs, ms, cs, os]) => {
        setArtStyles(as as any[]);
        setVoiceStyles(vsStyles as any[]);
        setVoices(vs as any[]);
        setMusic(ms as any[]);
        setCaptions(cs as any[]);
        setOverlays(os as any[]);
      }).finally(() => setRefsLoading(false));
    }
  }, [entity, id]);

  function setField(name: string, value: any) { setForm((f: any) => ({ ...f, [name]: value })); }

  async function save() {
    try {
      setSaving(true);
      // Remove only undefined keys; keep null to explicitly clear relations
      const cleaned: any = {};
      for (const [key, value] of Object.entries(form)) {
        if (value === undefined) continue;
        if (entity === 'templates' && key === 'weight') {
          const raw = typeof value === 'string' ? value.trim() : value;
          if (raw === '' || raw === undefined) {
            continue;
          }
          if (typeof raw === 'string' && !/^\d+$/.test(raw)) {
            toast.error('Invalid weight', { description: 'Weight must be a whole number.' });
            return;
          }
          const numeric = typeof raw === 'number' ? raw : Number(raw);
          if (!Number.isFinite(numeric)) {
            toast.error('Invalid weight', { description: 'Weight must be a valid number.' });
            return;
          }
          cleaned.weight = numeric;
          continue;
        }
        cleaned[key] = value;
      }
      const parsed = schema.partial().safeParse(cleaned);
      if (!parsed.success) { const issue = parsed.error?.issues?.[0]; toast.error('Invalid data', { description: issue?.message || 'Fix fields and try again.' }); return; }
      await Api.adminTemplatesUpdate(entity, id, parsed.data);
      toast.success('Saved');
      const fresh = await Api.adminTemplatesGet(entity, id);
      setItem(fresh);
      if (entity === 'templates') {
        const { id: _id, createdAt, updatedAt, ownerId, ...rest } = (fresh || {}) as any;
        const normalized: any = {};
        Object.entries(rest || {}).forEach(([k, v]) => {
          if (k === 'weight') {
            normalized[k] = v === null || v === undefined ? '' : String(v);
            return;
          }
          normalized[k] = v === null ? undefined : v;
        });
        if (normalized.weight === undefined) {
          normalized.weight = '';
        }
        setForm(normalized);
      }
    } catch {} finally { setSaving(false); }
  }

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  if (!item) return <div className="p-4 text-sm text-muted-foreground">Not found.</div>;

  const listTitleMap: Record<AdminEntity,string> = {
    'templates':'Video Templates',
    'art-styles':'Art Styles',
    'voice-styles':'Voice Styles',
    'voices':'Voices',
    'music':'Music',
    'captions-styles':'Captions Styles',
    'overlays':'Overlays'
  };
  const listPath = `/admin/templates/manage/${entity}`;
  const backLabel = `Back to ${listTitleMap[entity]}`;

  return (
    <div className="space-y-4">
      <AdminBackButton className="w-fit" href={listPath} label={backLabel} />
      <div>
        <div className="flex items-center gap-2">
          {form?.isPublic ? (
            <Globe className="h-5 w-5 text-emerald-500" aria-label="Public" />
          ) : (
            <Lock className="h-5 w-5 text-amber-500" aria-label="Private" />
          )}
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          <span>Created: {item?.createdAt ? formatDateTimeAdmin(item.createdAt) : '—'}</span>
          <span className="mx-2">•</span>
          <span>Updated: {item?.updatedAt ? formatDateTimeAdmin(item.updatedAt) : '—'}</span>
        </div>
      </div>

      {/* Preview for templates */}
      {entity === 'templates' ? (
        <Card>
          <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {form.previewImageUrl ? (
              <img src={form.previewImageUrl} alt="Preview" className="max-w-full max-h-[500px] h-auto rounded border" />
            ) : null}
            {form.previewVideoUrl ? (
              <video controls className="w-full max-h-[500px] h-auto rounded border" src={form.previewVideoUrl} />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Edit</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {/* Visibility toggle (applies to all entities) */}
          <div className="flex items-center justify-between rounded-md border border-gray-200 p-3 dark:border-gray-800">
            <div>
              <div className="text-sm font-medium">Public</div>
              <div className="text-xs text-muted-foreground">If on, this item is visible for everyone.</div>
            </div>
            <Switch checked={!!form.isPublic} onCheckedChange={(v)=>setField('isPublic', !!v)} aria-label="Toggle public" />
          </div>
          {/* Per-entity forms */}
          {entity === 'templates' ? (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Title</Label>
                  <span className="text-xs text-rose-600">Required</span>
                </div>
                <Input value={form.title || ''} onChange={(e)=>setField('title', e.target.value)} />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Code</Label>
                  <span className="text-xs text-rose-600">Required</span>
                </div>
                <Input value={form.code || ''} onChange={(e)=>setField('code', e.target.value)} />
                <div className="text-[11px] text-muted-foreground">Up to 255 characters. Used to identify this template.</div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Weight</Label>
                  <span className="text-xs text-muted-foreground">Optional</span>
                </div>
                <Input
                  value={form.weight ?? ''}
                  inputMode="numeric"
                  onChange={(e)=>{
                    const val = e.target.value;
                    if (val === '' || /^\d+$/.test(val)) {
                      setField('weight', val);
                    }
                  }}
                />
                <div className="text-[11px] text-muted-foreground">Higher weight surfaces this template earlier on the main page.</div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Description</Label>
                  <span className="text-xs text-muted-foreground">Optional</span>
                </div>
                <Textarea value={form.description || ''} onChange={(e)=>setField('description', e.target.value)} />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Preview image URL</Label>
                  <span className="text-xs text-rose-600">Required</span>
                </div>
                <Input value={form.previewImageUrl || ''} onChange={(e)=>setField('previewImageUrl', e.target.value)} />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Preview video URL</Label>
                  <span className="text-xs text-rose-600">Required</span>
                </div>
                <Input value={form.previewVideoUrl || ''} onChange={(e)=>setField('previewVideoUrl', e.target.value)} />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Text generation prompt</Label>
                  <span className="text-xs text-rose-600">Required</span>
                </div>
                <Textarea value={form.textPrompt || ''} onChange={(e)=>setField('textPrompt', e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Art style <span className="text-muted-foreground">(Optional)</span></Label>
                  <Select value={form.artStyleId ?? NONE} onValueChange={(v)=>setField('artStyleId', v===NONE?null:v)}>
                    <SelectTrigger disabled={refsLoading}><SelectValue placeholder="Select art style"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {artStyles.map((x)=> (<SelectItem key={x.id} value={x.id}>{x.title||x.id}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Voice style <span className="text-muted-foreground">(Optional)</span></Label>
                  <Select value={form.voiceStyleId ?? NONE} onValueChange={(v)=>setField('voiceStyleId', v===NONE?null:v)}>
                    <SelectTrigger disabled={refsLoading}><SelectValue placeholder="Select voice style"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {voiceStyles.map((x)=> (<SelectItem key={x.id} value={x.id}>{x.title||x.id}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Voice <span className="text-muted-foreground">(Optional)</span></Label>
                  <Select value={form.voiceId ?? NONE} onValueChange={(v)=>setField('voiceId', v===NONE?null:v)}>
                    <SelectTrigger disabled={refsLoading}><SelectValue placeholder="Select voice"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {voices.map((x)=> (<SelectItem key={x.id} value={x.id}>{x.title||x.id}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Music <span className="text-muted-foreground">(Optional)</span></Label>
                  <Select value={form.musicId ?? NONE} onValueChange={(v)=>setField('musicId', v===NONE?null:v)}>
                    <SelectTrigger disabled={refsLoading}><SelectValue placeholder="Select music"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {music.map((x)=> (<SelectItem key={x.id} value={x.id}>{x.title||x.id}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Captions style <span className="text-muted-foreground">(Optional)</span></Label>
                  <Select value={form.captionsStyleId ?? NONE} onValueChange={(v)=>setField('captionsStyleId', v===NONE?null:v)}>
                    <SelectTrigger disabled={refsLoading}><SelectValue placeholder="Select captions"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {captions.map((x)=> (<SelectItem key={x.id} value={x.id}>{x.title||x.id}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Overlay <span className="text-muted-foreground">(Optional)</span></Label>
                  <Select value={form.overlayId ?? NONE} onValueChange={(v)=>setField('overlayId', v===NONE?null:v)}>
                    <SelectTrigger disabled={refsLoading}><SelectValue placeholder="Select overlay"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {overlays.map((x)=> (<SelectItem key={x.id} value={x.id}>{x.title||x.id}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : null}

          {/* Others (minimal): re-use same required/optional semantics as list page */}
          {entity === 'voices' ? (
            <>
              <div className="space-y-1"><Label>Title <span className="text-rose-600">(Required)</span></Label><Input value={form.title||''} onChange={(e)=>setField('title',e.target.value)} /></div>
              <div className="space-y-1"><Label>External ID <span className="text-muted-foreground">(Optional)</span></Label><Input value={form.externalId||''} onChange={(e)=>setField('externalId',e.target.value)} /></div>
              <div className="space-y-1"><Label>Description <span className="text-muted-foreground">(Optional)</span></Label><Textarea value={form.description||''} onChange={(e)=>setField('description',e.target.value)} /></div>
            </>
          ) : null}
          {entity === 'music' ? (
            <>
              <div className="space-y-1"><Label>Title <span className="text-rose-600">(Required)</span></Label><Input value={form.title||''} onChange={(e)=>setField('title',e.target.value)} /></div>
              <div className="space-y-1"><Label>URL <span className="text-rose-600">(Required)</span></Label><Input value={form.url||''} onChange={(e)=>setField('url',e.target.value)} /></div>
              <div className="space-y-1"><Label>Description <span className="text-muted-foreground">(Optional)</span></Label><Textarea value={form.description||''} onChange={(e)=>setField('description',e.target.value)} /></div>
            </>
          ) : null}
          {entity === 'art-styles' ? (
            <>
              <div className="space-y-1"><Label>Title <span className="text-rose-600">(Required)</span></Label><Input value={form.title||''} onChange={(e)=>setField('title',e.target.value)} /></div>
              <div className="space-y-1"><Label>Description <span className="text-muted-foreground">(Optional)</span></Label><Textarea value={form.description||''} onChange={(e)=>setField('description',e.target.value)} /></div>
              <div className="space-y-1"><Label>Image style prompt <span className="text-rose-600">(Required)</span></Label><Textarea value={form.prompt||''} onChange={(e)=>setField('prompt',e.target.value)} /></div>
              <div className="space-y-1"><Label>Reference image URL <span className="text-muted-foreground">(Optional)</span></Label><Input value={form.referenceImageUrl||''} onChange={(e)=>setField('referenceImageUrl',e.target.value)} /></div>
            </>
          ) : null}
          {entity === 'voice-styles' ? (
            <>
              <div className="space-y-1"><Label>Title <span className="text-rose-600">(Required)</span></Label><Input value={form.title||''} onChange={(e)=>setField('title',e.target.value)} /></div>
              <div className="space-y-1"><Label>Description <span className="text-muted-foreground">(Optional)</span></Label><Textarea value={form.description||''} onChange={(e)=>setField('description',e.target.value)} /></div>
              <div className="space-y-1"><Label>Voice style prompt <span className="text-rose-600">(Required)</span></Label><Textarea value={form.prompt||''} onChange={(e)=>setField('prompt',e.target.value)} /></div>
            </>
          ) : null}
          {entity === 'captions-styles' ? (
            <>
              <div className="space-y-1"><Label>Title <span className="text-rose-600">(Required)</span></Label><Input value={form.title||''} onChange={(e)=>setField('title',e.target.value)} /></div>
              <div className="space-y-1"><Label>External ID <span className="text-muted-foreground">(Optional)</span></Label><Input value={form.externalId||''} onChange={(e)=>setField('externalId',e.target.value)} /></div>
              <div className="space-y-1"><Label>Description <span className="text-muted-foreground">(Optional)</span></Label><Textarea value={form.description||''} onChange={(e)=>setField('description',e.target.value)} /></div>
            </>
          ) : null}
          {entity === 'overlays' ? (
            <>
              <div className="space-y-1"><Label>Title <span className="text-rose-600">(Required)</span></Label><Input value={form.title||''} onChange={(e)=>setField('title',e.target.value)} /></div>
              <div className="space-y-1"><Label>Overlay URL <span className="text-rose-600">(Required)</span></Label><Input value={form.url||''} onChange={(e)=>setField('url',e.target.value)} /></div>
              <div className="space-y-1"><Label>Description <span className="text-muted-foreground">(Optional)</span></Label><Textarea value={form.description||''} onChange={(e)=>setField('description',e.target.value)} /></div>
            </>
          ) : null}

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving} aria-busy={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </>
              )}
            </Button>
            <Button variant="destructive" onClick={()=>setConfirmDelete(true)} className="ml-auto">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={(o)=>{ if(!o){ setConfirmDelete(false); setDeleting(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {title}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone.</p>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild><Button size="sm" variant="ghost">Cancel</Button></DialogClose>
            <Button
              variant="destructive"
              disabled={deleting}
              aria-busy={deleting}
              onClick={async()=>{
                try { setDeleting(true); await Api.adminTemplatesDelete(entity, id); toast.success('Deleted'); window.location.href = `/admin/templates/manage/${entity}`; } finally { setDeleting(false); }
              }}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
