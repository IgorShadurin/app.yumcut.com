"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectTemplateImageDTO } from '@/shared/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Api } from '@/lib/api-client';
import { LIMITS } from '@/shared/constants/limits';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';
import { IMAGE_GENERATION_PROVIDERS } from '@/shared/constants/image-generation';
import { parseImageSize, getImageSizeValidationError } from '@/shared/image-generation/size';
import { Check, Quote, Sparkles, Upload } from 'lucide-react';
import { resolveStorageBaseUrl } from '@/components/main/character-modal/storage';
import { ProjectStatus } from '@/shared/constants/status';
import { ProjectVideoRegenerateButton } from './ProjectVideoRegenerateButton';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';

type ImageEditorState = {
  prompt: string;
  provider: string;
  model: string;
  isRegenerating: boolean;
  isApplying: boolean;
  isUploading: boolean;
  appliedPreviewUrl: string | null;
  pendingPreviewUrl: string | null;
  pendingPreviewData: { format: string; base64: string } | null;
  previewOpen: boolean;
  errorOpen: boolean;
  errorMessage: string | null;
  errorKind: 'regenerate' | 'apply' | 'upload' | null;
};

type RegenerateResponse = {
  templateImageId: string;
  provider: string;
  model: string;
  width: number;
  height: number;
  format: string;
  imageBase64: string;
};

const DEFAULT_PROVIDER_ID = IMAGE_GENERATION_PROVIDERS[0]?.id ?? 'runware';
const IMAGE_REGEN_TOKEN_COST = TOKEN_COSTS.actions.imageRegeneration;

async function loadImageFromFile(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image'));
  });
  return img;
}

async function resizeAndCropToBlob(file: File, width: number, height: number) {
  const img = await loadImageFromFile(file);
  const scale = Math.max(width / img.width, height / img.height);
  const cropWidth = Math.round(width / scale);
  const cropHeight = Math.round(height / scale);
  const cropX = Math.max(0, Math.round((img.width - cropWidth) / 2));
  const cropY = Math.max(0, Math.round((img.height - cropHeight) / 2));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to prepare image canvas');
  ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((out) => resolve(out), 'image/jpeg', 0.92)
  );
  if (!blob) throw new Error('Failed to encode resized image');
  return blob;
}

function base64ToBlob(base64: string, mime: string) {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }
  return new Blob([buffer], { type: mime });
}

function resolveImageMime(format: string) {
  const normalized = format.trim().toLowerCase();
  if (normalized === 'jpg') return 'image/jpeg';
  if (normalized === 'jpeg') return 'image/jpeg';
  if (normalized === 'png') return 'image/png';
  if (normalized.startsWith('image/')) return normalized;
  return `image/${normalized}`;
}

export function ProjectImageEditorSection({
  projectId,
  images,
  projectStatus,
  canRecreateVideo,
}: {
  projectId: string;
  images: ProjectTemplateImageDTO[];
  projectStatus: ProjectStatus;
  canRecreateVideo?: boolean;
}) {
  const { language } = useAppLanguage();
  const tr = (en: string): string => {
    if (language !== 'ru') return en;
    const map: Record<string, string> = {
      'Image editor': 'Редактор изображений',
      'Review generated images and update the prompt before regenerating.': 'Проверьте сгенерированные изображения и обновите промпт перед перегенерацией.',
      'No preview available': 'Превью недоступно',
      Provider: 'Провайдер',
      Model: 'Модель',
      Size: 'Размер',
      Unknown: 'Неизвестно',
      Sentence: 'Фраза',
      Prompt: 'Промпт',
      'Select provider': 'Выберите провайдера',
      'Select model': 'Выберите модель',
      'Regenerating…': 'Перегенерация…',
      'Regenerate image': 'Перегенерировать изображение',
      'Uploading…': 'Загрузка…',
      'Upload image': 'Загрузить изображение',
      'Preview regenerated image': 'Предпросмотр перегенерированного изображения',
      'Review the new image. Apply it to the editor or cancel to keep the current one.':
        'Проверьте новое изображение. Примените его или отмените, чтобы оставить текущее.',
      'Preview is unavailable.': 'Предпросмотр недоступен.',
      Cancel: 'Отмена',
      'Applying…': 'Применяем…',
      'Apply image': 'Применить изображение',
      'Regeneration failed': 'Ошибка перегенерации',
      'Image update failed': 'Ошибка обновления изображения',
      'We could not regenerate the image.': 'Не удалось перегенерировать изображение.',
      'Tokens will be returned for unsuccessful regenerations.': 'При неуспешной перегенерации токены будут возвращены.',
      'The current project image was not replaced.': 'Текущее изображение проекта не было заменено.',
      'Got it': 'Понятно',
      'No template images are available yet.': 'Шаблонные изображения пока недоступны.',
      'Cost: ': 'Стоимость: ',
      'Template image size is missing or invalid.': 'Размер шаблонного изображения отсутствует или некорректен.',
      'Storage base URL is not configured.': 'Базовый URL хранилища не настроен.',
      'Failed to obtain upload authorization': 'Не удалось получить авторизацию на загрузку',
      'Selected file type is not allowed': 'Выбранный тип файла не поддерживается',
      'Storage upload failed': 'Ошибка загрузки в хранилище',
      'Storage response missing metadata': 'Ответ хранилища не содержит метаданные',
      'Failed to upload replacement image.': 'Не удалось загрузить изображение для замены.',
      'Unable to apply image without storage configuration.': 'Невозможно применить изображение без настройки хранилища.',
      'Generated image type is not allowed': 'Тип сгенерированного изображения не поддерживается',
      'Failed to apply the regenerated image.': 'Не удалось применить перегенерированное изображение.',
      'Prompt is required and must be under {max} characters.': 'Промпт обязателен и должен быть короче {max} символов.',
      'Preview for': 'Предпросмотр для',
      'Failed to read image': 'Не удалось прочитать изображение',
      'Failed to load image': 'Не удалось загрузить изображение',
      'Unable to prepare image canvas': 'Не удалось подготовить холст изображения',
      'Failed to encode resized image': 'Не удалось закодировать изменённое изображение',
    };
    return map[en] ?? en;
  };
  const templateImageSizeError = tr('Template image size is missing or invalid.');
  const promptValidationMessage = tr('Prompt is required and must be under {max} characters.')
    .replace('{max}', String(LIMITS.imagePromptMax));
  const maxFileSizeMessage = (maxBytes: number) => {
    const maxMb = Math.floor(maxBytes / 1024 / 1024);
    return language === 'ru'
      ? `Файл слишком большой. Максимальный размер: ${maxMb} МБ`
      : `File is too large. Maximum size is ${maxMb}MB`;
  };
  const maxGeneratedImageSizeMessage = (maxBytes: number) => {
    const maxMb = Math.floor(maxBytes / 1024 / 1024);
    return language === 'ru'
      ? `Изображение слишком большое. Максимальный размер: ${maxMb} МБ`
      : `Image is too large. Maximum size is ${maxMb}MB`;
  };
  const storageUploadFailedMessage = (status: number) => (
    `${tr('Storage upload failed')} (${status})`
  );
  const imageRegenTokenLabel = language === 'ru'
    ? `${IMAGE_REGEN_TOKEN_COST} ${IMAGE_REGEN_TOKEN_COST === 1 ? 'токен' : 'токенов'}`
    : `${IMAGE_REGEN_TOKEN_COST} token${IMAGE_REGEN_TOKEN_COST === 1 ? '' : 's'}`;

  const hasImages = Array.isArray(images) && images.length > 0;
  const providerOptions = useMemo(() => IMAGE_GENERATION_PROVIDERS, []);
  const [editorState, setEditorState] = useState<Record<string, ImageEditorState>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const storageBaseUrl = useMemo(() => {
    try {
      return resolveStorageBaseUrl();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setEditorState((prev) => {
      const next: Record<string, ImageEditorState> = {};
      for (const image of images) {
        const existing = prev[image.id];
        if (existing) {
          next[image.id] = {
            ...existing,
            prompt: existing.prompt || image.prompt || '',
            model: existing.model || image.model || existing.model,
            provider: existing.provider || DEFAULT_PROVIDER_ID,
          };
        } else {
          next[image.id] = {
            prompt: image.prompt || '',
            provider: DEFAULT_PROVIDER_ID,
            model: image.model || 'runware:108@1',
            isRegenerating: false,
            isApplying: false,
            isUploading: false,
            appliedPreviewUrl: null,
            pendingPreviewUrl: null,
            pendingPreviewData: null,
            previewOpen: false,
            errorOpen: false,
            errorMessage: null,
            errorKind: null,
          };
        }
      }
      return next;
    });
  }, [images]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{tr('Image editor')}</CardTitle>
        <CardDescription>
          {tr('Review generated images and update the prompt before regenerating.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasImages ? (
          <div className="flex items-center justify-end">
            <ProjectVideoRegenerateButton
              projectId={projectId}
              projectStatus={projectStatus}
              canRecreate={canRecreateVideo}
              size="sm"
              variant="default"
              className="flex items-center"
            />
          </div>
        ) : null}
        {hasImages ? (
          <>
            <div className="space-y-4 mt-4">
              {images.map((image) => {
              const state = editorState[image.id];
              const provider = providerOptions.find((item) => item.id === state?.provider) ?? providerOptions[0];
              const modelOptions = provider?.models ?? [];
              const selectedModel = state?.model || modelOptions[0]?.id || '';
              const previewUrl = state?.appliedPreviewUrl || image.imageUrl;
              const pendingPreview = state?.pendingPreviewData;
              const promptValue = state?.prompt ?? '';
              const promptLength = promptValue.length;
              const isPromptValid = promptValue.trim().length > 0 && promptLength <= LIMITS.imagePromptMax;
              const size = parseImageSize(image.size);
              const sizeError = size
                ? getImageSizeValidationError(size, {
                  minTotalPixels: LIMITS.imageMinPixels,
                  maxTotalPixels: LIMITS.imageMaxPixels,
                  sizeMultiple: LIMITS.imageSizeMultiple,
                })
                : templateImageSizeError;
              const sizeValidationMessage = sizeError ? templateImageSizeError : null;
              const sizeValid = Boolean(size && !sizeError);
              const canRegenerate = Boolean(provider && selectedModel && isPromptValid && sizeValid && !state?.isRegenerating);
              const canUpload = Boolean(sizeValid && !state?.isUploading);
              const errorTitle = state?.errorKind === 'regenerate' ? tr('Regeneration failed') : tr('Image update failed');
              const handleRegenerate = async () => {
                if (!canRegenerate || !provider) return;
                if (!size || !sizeValid) {
                  setEditorState((prev) => ({
                    ...prev,
                    [image.id]: {
                      ...prev[image.id],
                      errorOpen: true,
                      errorMessage: sizeValidationMessage || templateImageSizeError,
                      errorKind: 'regenerate',
                    },
                  }));
                  return;
                }
                setEditorState((prev) => ({
                  ...prev,
                  [image.id]: {
                    ...prev[image.id],
                    isRegenerating: true,
                    errorOpen: false,
                    errorMessage: null,
                    errorKind: null,
                  },
                }));
                try {
                  const response = await Api.regenerateProjectImage(projectId, {
                    templateImageId: image.id,
                    prompt: promptValue.trim(),
                    provider: provider.id,
                    model: selectedModel,
                  }, { showErrorToast: false }) as RegenerateResponse;
                  const nextPreview = `data:image/${response.format};base64,${response.imageBase64}`;
                  setEditorState((prev) => ({
                    ...prev,
                    [image.id]: {
                      ...prev[image.id],
                      pendingPreviewUrl: nextPreview,
                      pendingPreviewData: { format: response.format, base64: response.imageBase64 },
                      previewOpen: true,
                    },
                  }));
                } catch (err: any) {
                  const message = err?.error?.message
                    || err?.message
                    || (language === 'ru'
                      ? 'Не удалось перегенерировать изображение. Потраченные токены будут возвращены.'
                      : 'We could not regenerate the image. Any tokens spent will be returned.');
                  setEditorState((prev) => ({
                    ...prev,
                    [image.id]: {
                      ...prev[image.id],
                      errorOpen: true,
                      errorMessage: message,
                      errorKind: 'regenerate',
                    },
                  }));
                } finally {
                  setEditorState((prev) => ({
                    ...prev,
                    [image.id]: {
                      ...prev[image.id],
                      isRegenerating: false,
                    },
                  }));
                }
              };

              return (
                <div
                  key={image.id}
                  className="rounded-lg border border-border/80 bg-background/60 p-4 space-y-4"
                >
                  <div className="flex flex-col gap-4 md:flex-row">
                    <div className="md:w-56">
                      <div
                        className="overflow-hidden rounded-md border border-border/70 bg-muted flex items-center justify-center"
                        style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}
                      >
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt={image.imageName}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="text-xs text-muted-foreground">{tr('No preview available')}</div>
                        )}
                      </div>
                      <div className="mt-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="default">{image.imageName}</Badge>
                          {image.size ? <Badge variant="default">{image.size}</Badge> : null}
                          {image.model ? <Badge variant="default">{image.model}</Badge> : null}
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`image-provider-${image.id}`}>{tr('Provider')}</Label>
                          <Select
                            value={provider?.id ?? DEFAULT_PROVIDER_ID}
                            onValueChange={(value) => {
                              setEditorState((prev) => {
                                const current = prev[image.id];
                                const nextProvider = providerOptions.find((item) => item.id === value);
                                const fallbackModel = nextProvider?.models[0]?.id ?? current?.model ?? 'runware:108@1';
                                return {
                                  ...prev,
                                  [image.id]: {
                                    ...current,
                                    provider: value,
                                    model: fallbackModel,
                                  },
                                };
                              });
                            }}
                          >
                            <SelectTrigger id={`image-provider-${image.id}`}>
                              <SelectValue placeholder={tr('Select provider')} />
                            </SelectTrigger>
                            <SelectContent>
                              {providerOptions.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`image-model-${image.id}`}>{tr('Model')}</Label>
                          <Select
                            value={selectedModel}
                            onValueChange={(value) => {
                              setEditorState((prev) => ({
                                ...prev,
                                [image.id]: {
                                  ...prev[image.id],
                                  model: value,
                                },
                              }));
                            }}
                          >
                            <SelectTrigger id={`image-model-${image.id}`}>
                              <SelectValue placeholder={tr('Select model')} />
                            </SelectTrigger>
                            <SelectContent>
                              {modelOptions.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.label}
                                </SelectItem>
                              ))}
                              {selectedModel && !modelOptions.some((item) => item.id === selectedModel) ? (
                                <SelectItem value={selectedModel}>
                                  {selectedModel}
                                </SelectItem>
                              ) : null}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`image-size-${image.id}`}>{tr('Size')}</Label>
                          <Input
                            id={`image-size-${image.id}`}
                            value={image.size || tr('Unknown')}
                            readOnly
                            disabled
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col gap-3">
                      {image.sentence ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Quote className="h-4 w-4 text-amber-500" />
                            <Label>{tr('Sentence')}</Label>
                          </div>
                          <div className="text-sm leading-snug text-foreground break-words">{image.sentence}</div>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor={`image-prompt-${image.id}`}>{tr('Prompt')}</Label>
                          <span className="text-xs text-muted-foreground">
                            {promptLength}/{LIMITS.imagePromptMax}
                          </span>
                        </div>
                        <Textarea
                          id={`image-prompt-${image.id}`}
                          value={promptValue}
                          rows={30}
                          onChange={(event) => {
                            const next = event.target.value;
                            const clipped = next.length > LIMITS.imagePromptMax
                              ? next.slice(0, LIMITS.imagePromptMax)
                              : next;
                            setEditorState((prev) => ({
                              ...prev,
                              [image.id]: {
                                ...prev[image.id],
                                prompt: clipped,
                              },
                            }));
                          }}
                        />
                        {!isPromptValid ? (
                          <div className="text-xs text-rose-600 dark:text-rose-300">
                            {promptValidationMessage}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2" />
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex flex-col gap-1">
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleRegenerate}
                              disabled={!canRegenerate}
                            >
                              <Sparkles className="h-4 w-4 mr-2" />
                              {state?.isRegenerating ? tr('Regenerating…') : tr('Regenerate image')}
                            </Button>
                            <span className="text-[11px] text-muted-foreground">
                              {tr('Cost: ')}{imageRegenTokenLabel}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <input
                              ref={(node) => { fileInputRefs.current[image.id] = node; }}
                              type="file"
                              accept="image/png,image/jpeg"
                              className="hidden"
                              onChange={async (event) => {
                              const file = event.target.files?.[0] ?? null;
                              event.target.value = '';
                              if (!file) return;
                              if (!storageBaseUrl) {
                                setEditorState((prev) => ({
                                  ...prev,
                                  [image.id]: {
                                    ...prev[image.id],
                                    errorOpen: true,
                                    errorMessage: tr('Storage base URL is not configured.'),
                                    errorKind: 'upload',
                                  },
                                }));
                                return;
                              }
                              if (!size || !sizeValid) {
                                setEditorState((prev) => ({
                                  ...prev,
                                  [image.id]: {
                                    ...prev[image.id],
                                    errorOpen: true,
                                    errorMessage: sizeValidationMessage || templateImageSizeError,
                                    errorKind: 'upload',
                                  },
                                }));
                                return;
                              }
                              const targetSize = size;
                              setEditorState((prev) => ({
                                ...prev,
                                [image.id]: {
                                  ...prev[image.id],
                                  isUploading: true,
                                  errorOpen: false,
                                  errorMessage: null,
                                  errorKind: null,
                                },
                              }));
                              try {
                                const blob = await resizeAndCropToBlob(file, targetSize.width, targetSize.height);
                                const grant = await Api.createCharacterUploadToken();
                                if (!grant?.data || !grant.signature) {
                                  throw new Error(tr('Failed to obtain upload authorization'));
                                }
                                if (!grant.mimeTypes.includes(blob.type)) {
                                  throw new Error(tr('Selected file type is not allowed'));
                                }
                                if (blob.size > grant.maxBytes) {
                                  throw new Error(maxFileSizeMessage(grant.maxBytes));
                                }
                                const form = new FormData();
                                form.set('file', new File([blob], `${image.imageName}.jpg`, { type: blob.type }));
                                form.set('data', grant.data);
                                form.set('signature', grant.signature);
                                const target = `${storageBaseUrl.replace(/\/$/, '')}/api/storage/user-images`;
                                const response = await fetch(target, { method: 'POST', body: form });
                                if (!response.ok) {
                                  throw new Error(storageUploadFailedMessage(response.status));
                                }
                                const payload = await response.json();
                                if (!payload?.path || !payload?.url || !payload?.data || !payload?.signature) {
                                  throw new Error(tr('Storage response missing metadata'));
                                }
                                const replace = await Api.replaceProjectImage(projectId, {
                                  templateImageId: image.id,
                                  data: payload.data,
                                  signature: payload.signature,
                                  path: payload.path,
                                  url: payload.url,
                                });
                                setEditorState((prev) => ({
                                  ...prev,
                                  [image.id]: {
                                    ...prev[image.id],
                                    appliedPreviewUrl: replace.imageUrl || payload.url,
                                  },
                                }));
                              } catch (err: any) {
                                const rawMessage = err?.error?.message || err?.message;
                                const message = rawMessage
                                  ? tr(rawMessage)
                                  : tr('Failed to upload replacement image.');
                                setEditorState((prev) => ({
                                  ...prev,
                                  [image.id]: {
                                    ...prev[image.id],
                                    errorOpen: true,
                                    errorMessage: message,
                                    errorKind: 'upload',
                                  },
                                }));
                              } finally {
                                setEditorState((prev) => ({
                                  ...prev,
                                  [image.id]: {
                                    ...prev[image.id],
                                    isUploading: false,
                                  },
                                }));
                              }
                            }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!canUpload}
                              onClick={() => fileInputRefs.current[image.id]?.click()}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              {state?.isUploading ? tr('Uploading…') : tr('Upload image')}
                            </Button>
                            <span className="text-[11px] text-muted-foreground">
                              {tr('Cost: ')}0 {language === 'ru' ? 'токенов' : 'tokens'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Dialog
                    open={Boolean(state?.previewOpen)}
                    onOpenChange={(open) => {
                      setEditorState((prev) => ({
                        ...prev,
                        [image.id]: {
                          ...prev[image.id],
                          previewOpen: open,
                          ...(open ? {} : { pendingPreviewUrl: null, pendingPreviewData: null }),
                        },
                      }));
                    }}
                  >
                    <DialogContent className="max-w-2xl">
                      <DialogHeader className="flex-col items-start gap-1 text-left">
                        <DialogTitle className="text-lg font-semibold leading-tight">{tr('Preview regenerated image')}</DialogTitle>
                        <DialogDescription>
                          {tr('Review the new image. Apply it to the editor or cancel to keep the current one.')}
                        </DialogDescription>
                      </DialogHeader>
                      <div
                        className="mx-auto w-full max-w-2xl rounded-lg border border-border/70 bg-muted/40 overflow-hidden"
                        style={{
                          ...(size ? { aspectRatio: `${size.width} / ${size.height}` } : {}),
                          maxHeight: 450,
                        }}
                      >
                        {state?.pendingPreviewUrl ? (
                          <img
                            src={state.pendingPreviewUrl}
                            alt={`${tr('Preview for')} ${image.imageName}`}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="p-6 text-sm text-muted-foreground">{tr('Preview is unavailable.')}</div>
                        )}
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setEditorState((prev) => ({
                              ...prev,
                              [image.id]: {
                                ...prev[image.id],
                                previewOpen: false,
                                pendingPreviewUrl: null,
                                pendingPreviewData: null,
                              },
                            }));
                          }}
                        >
                          {tr('Cancel')}
                        </Button>
                        <Button
                          type="button"
                          onClick={async () => {
                            if (!pendingPreview || !storageBaseUrl) {
                              setEditorState((prev) => ({
                                ...prev,
                                [image.id]: {
                                  ...prev[image.id],
                                  errorOpen: true,
                                  errorMessage: tr('Unable to apply image without storage configuration.'),
                                  errorKind: 'apply',
                                },
                              }));
                              return;
                            }
                            setEditorState((prev) => ({
                              ...prev,
                              [image.id]: {
                                ...prev[image.id],
                                isApplying: true,
                                errorOpen: false,
                                errorMessage: null,
                                errorKind: null,
                              },
                            }));
                            try {
                              const blob = base64ToBlob(pendingPreview.base64, resolveImageMime(pendingPreview.format));
                              const grant = await Api.createCharacterUploadToken();
                              if (!grant?.data || !grant.signature) {
                                throw new Error(tr('Failed to obtain upload authorization'));
                              }
                              if (!grant.mimeTypes.includes(blob.type)) {
                                throw new Error(tr('Generated image type is not allowed'));
                              }
                              if (blob.size > grant.maxBytes) {
                                throw new Error(maxGeneratedImageSizeMessage(grant.maxBytes));
                              }
                              const form = new FormData();
                              form.set('file', new File([blob], `${image.imageName}.jpg`, { type: blob.type }));
                              form.set('data', grant.data);
                              form.set('signature', grant.signature);
                              const target = `${storageBaseUrl.replace(/\/$/, '')}/api/storage/user-images`;
                              const response = await fetch(target, { method: 'POST', body: form });
                              if (!response.ok) {
                                throw new Error(storageUploadFailedMessage(response.status));
                              }
                              const payload = await response.json();
                              if (!payload?.path || !payload?.url || !payload?.data || !payload?.signature) {
                                throw new Error(tr('Storage response missing metadata'));
                              }
                              const replace = await Api.replaceProjectImage(projectId, {
                                templateImageId: image.id,
                                data: payload.data,
                                signature: payload.signature,
                                path: payload.path,
                                url: payload.url,
                                prompt: promptValue.trim(),
                                model: selectedModel,
                              });
                              setEditorState((prev) => ({
                                ...prev,
                                [image.id]: {
                                  ...prev[image.id],
                                  appliedPreviewUrl: replace.imageUrl || payload.url,
                                  pendingPreviewUrl: null,
                                  pendingPreviewData: null,
                                  previewOpen: false,
                                },
                              }));
                            } catch (err: any) {
                              const rawMessage = err?.error?.message || err?.message;
                              const message = rawMessage
                                ? tr(rawMessage)
                                : tr('Failed to apply the regenerated image.');
                              setEditorState((prev) => ({
                                ...prev,
                                [image.id]: {
                                  ...prev[image.id],
                                  errorOpen: true,
                                  errorMessage: message,
                                  errorKind: 'apply',
                                },
                              }));
                            } finally {
                              setEditorState((prev) => ({
                                ...prev,
                                [image.id]: {
                                  ...prev[image.id],
                                  isApplying: false,
                                },
                              }));
                            }
                          }}
                          disabled={state?.isApplying}
                        >
                          <Check className="h-4 w-4 mr-2" />
                          {state?.isApplying ? tr('Applying…') : tr('Apply image')}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog
                    open={Boolean(state?.errorOpen)}
                    onOpenChange={(open) => {
                      setEditorState((prev) => ({
                        ...prev,
                        [image.id]: {
                          ...prev[image.id],
                          errorOpen: open,
                          errorKind: open ? prev[image.id]?.errorKind ?? null : null,
                        },
                      }));
                    }}
                  >
                    <DialogContent className="max-w-md">
                      <DialogHeader className="flex-col items-start gap-1 text-left">
                        <DialogTitle className="text-lg font-semibold leading-tight">{errorTitle}</DialogTitle>
                        <DialogDescription>
                          {state?.errorMessage || tr('We could not regenerate the image.')}
                        </DialogDescription>
                      </DialogHeader>
                      {state?.errorKind === 'regenerate' ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          {tr('Tokens will be returned for unsuccessful regenerations.')}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          {tr('The current project image was not replaced.')}
                        </div>
                      )}
                      <div className="mt-4 flex justify-end">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setEditorState((prev) => ({
                              ...prev,
                              [image.id]: {
                                ...prev[image.id],
                                errorOpen: false,
                                errorKind: null,
                              },
                            }));
                          }}
                        >
                          {tr('Got it')}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              );
              })}
            </div>
            <div className="mt-4 flex items-center justify-end">
            <ProjectVideoRegenerateButton
              projectId={projectId}
              projectStatus={projectStatus}
              canRecreate={canRecreateVideo}
              size="sm"
              variant="default"
              className="flex items-center"
            />
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">{tr('No template images are available yet.')}</div>
        )}
      </CardContent>
    </Card>
  );
}
