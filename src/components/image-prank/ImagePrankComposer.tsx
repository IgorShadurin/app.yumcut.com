"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CreditCard, Crown, ImagePlus, Images, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { Api } from '@/lib/api-client';
import { resolveStorageBaseUrl } from '@/components/main/character-modal/storage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ImagePreviewDialog } from '@/components/image-prank/ImagePreviewDialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';
import {
  IMAGE_PRANK_PROMPT_PREFILL_PARAM,
  normalizeImagePrankPromptPrefill,
} from '@/components/image-prank/image-prank-prefill';
import {
  DEFAULT_IMAGE_PRANK_GENERATION_MODEL,
  IMAGE_PRANK_SELECTABLE_MODEL_OPTIONS,
  normalizeSelectableImagePrankGenerationModel,
  type ImagePrankSelectableModel,
} from '@/shared/constants/image-generation';
import { requestTokenRefresh, useTokenSummary } from '@/hooks/useTokenSummary';
import { formatSubscriptionVideoCountForPaywall, getSubscriptionPlansForUi, type SubscriptionPlanKey } from '@/shared/constants/subscriptions';
import type { AppLanguageCode } from '@/shared/constants/app-language';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type {
  ImagePrankCatalogItemDTO,
  ImagePrankMode,
  ImagePrankSourceImageDTO,
  ImagePrankSourceImageRole,
} from '@/shared/types';
import {
  IMAGE_PRANK_WEB_USER_PROMPT_MAX_CHARACTERS,
  promptCharacterCount,
} from '@/shared/image-generation/prompt';

type UploadedSource = {
  role: ImagePrankSourceImageRole;
  path: string;
  url: string;
  label: string;
  width?: number | null;
  height?: number | null;
};

type PrefilledSource = UploadedSource & {
  previewUrl: string | null;
};

type ImageSlotState = {
  file: File | null;
  previewUrl: string | null;
};

type ZoomImage = {
  url: string;
  label: string;
};

type DeleteImageTarget = {
  slot: 'prank' | 'target';
  label: string;
};

const MAX_STORAGE_IMAGE_DIMENSION = 1080;
const IMAGE_PRANK_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MODEL_SELECT_VALUE = '__default__';

const MODEL_LABELS: Record<ImagePrankSelectableModel, string> = Object.fromEntries(
  IMAGE_PRANK_SELECTABLE_MODEL_OPTIONS.map((model) => [model.id, model.label]),
) as Record<ImagePrankSelectableModel, string>;

function toSelectableModelOverride(model: ImagePrankSelectableModel | null): ImagePrankSelectableModel | null {
  return model && model !== DEFAULT_IMAGE_PRANK_GENERATION_MODEL ? model : null;
}

const COPY: Record<AppLanguageCode, {
  title: string;
  customTitle: string;
  catalogLabel: string;
  prankImage: string;
  targetImage: string;
  referenceImage: string;
  upload: string;
  replace: string;
  deleteImage: string;
  confirmDeleteImageTitle: string;
  confirmDeleteImageDescription: (label: string) => string;
  promptLabel: string;
  modelLabel: string;
  defaultModelLabel: string;
  twoImagePromptPlaceholder: string;
  oneImagePromptPlaceholder: string;
  twoImageDefaultPrompt: string;
  oneImageDefaultPrompt: string;
  twoImageHint: string;
  oneImageHint: string;
  twoImages: string;
  oneImage: string;
  zoomImage: string;
  create: string;
  confirmTitle: string;
  confirmWithdrawIntro: string;
  confirmWithdrawOutro: string;
  confirmBalanceLabel: string;
  confirmBalanceOutro: string;
  confirmCreate: string;
  cancel: string;
  topUpTitle: string;
  topUpDescription: string;
  paywallCurrentBalance: (balance: number) => string;
  tokensPerCharge: string;
  imagesPerPeriod: (images: string, period: 'week' | 'month') => string;
  videosPerPeriod: (videos: string, period: 'week' | 'month') => string;
  paywallPerPeriod: (period: 'week' | 'month') => string;
  paywallChipLabel: (planKey: SubscriptionPlanKey) => string;
  paywallSubscribeWithPrice: (amount: string, periodLabel: string) => string;
  openingCheckout: string;
  toastPlanAlreadyActive: string;
  toastSubscriptionUpdated: string;
  toastOpenCheckoutFailed: string;
  loading: string;
  uploading: string;
  back: string;
  reuseLoadFailed: string;
  missingPrompt: string;
  promptTooLong: (max: number) => string;
  missingImages: string;
  tokenLoadFailed: string;
  createFailed: string;
}> = {
  en: {
    title: 'Image Prank',
    customTitle: 'Custom mix',
    catalogLabel: 'Catalog image',
    prankImage: 'Prank image',
    targetImage: 'Target image',
    referenceImage: 'Reference image',
    upload: 'Upload',
    replace: 'Replace',
    deleteImage: 'Delete image',
    confirmDeleteImageTitle: 'Delete uploaded image?',
    confirmDeleteImageDescription: (label) => `Remove "${label}" from this Image Prank draft?`,
    promptLabel: 'Prompt',
    modelLabel: 'Model',
    defaultModelLabel: 'Default (Seedream)',
    twoImagePromptPlaceholder: 'Example: place the prank image naturally inside the target photo. You can also say first image and second image.',
    oneImagePromptPlaceholder: 'Example: turn this image into a funny prank scene.',
    twoImageDefaultPrompt: 'Place the prank image on the target image so it fits the lighting, perspective, scale, and natural position.',
    oneImageDefaultPrompt: 'Edit this image into a natural prank scene while preserving the lighting, perspective, and realistic placement.',
    twoImageHint: 'The prank image is the first image. The target image is the second image. Describe how the first should fit into the second.',
    oneImageHint: 'Upload one image and describe the prank edit you want to make to it.',
    twoImages: '2 images',
    oneImage: '1 image',
    zoomImage: 'Open image preview',
    create: 'Continue',
    confirmTitle: 'Confirm project creation',
    confirmWithdrawIntro: 'This action will withdraw',
    confirmWithdrawOutro: 'tokens to start generating your Image Prank.',
    confirmBalanceLabel: 'Balance after creation:',
    confirmBalanceOutro: 'tokens.',
    confirmCreate: 'Confirm and create',
    cancel: 'Cancel',
    topUpTitle: 'Top up with subscription',
    topUpDescription: 'Subscribe to automatically get more tokens after each successful charge.',
    paywallCurrentBalance: (balance) => `Current balance: ${balance.toLocaleString()} tokens.`,
    tokensPerCharge: 'tokens per charge',
    imagesPerPeriod: (images, period) => `${images} images/${period}`,
    videosPerPeriod: (videos, period) => `${videos} videos/${period}`,
    paywallPerPeriod: (period) => period,
    paywallChipLabel: (planKey) => {
      if (planKey === 'weekly') return 'Just to try';
      if (planKey === 'monthly') return 'Most popular';
      return 'Best choice';
    },
    paywallSubscribeWithPrice: (amount, periodLabel) => `Subscribe • ${amount}/${periodLabel}`,
    openingCheckout: 'Opening checkout...',
    toastPlanAlreadyActive: 'This plan is already active.',
    toastSubscriptionUpdated: 'Subscription updated.',
    toastOpenCheckoutFailed: 'Failed to open checkout',
    loading: 'Loading',
    uploading: 'Uploading',
    back: 'Back',
    reuseLoadFailed: 'Could not load previous Image Prank',
    missingPrompt: 'Enter a prompt',
    promptTooLong: (max) => `Keep the prompt to ${max} characters or fewer`,
    missingImages: 'Upload the required images',
    tokenLoadFailed: 'Could not load token balance',
    createFailed: 'Failed to create Image Prank',
  },
  ru: {
    title: 'Image Prank',
    customTitle: 'Свой микс',
    catalogLabel: 'Картинка из каталога',
    prankImage: 'Prank-картинка',
    targetImage: 'Целевое изображение',
    referenceImage: 'Референс',
    upload: 'Загрузить',
    replace: 'Заменить',
    deleteImage: 'Удалить изображение',
    confirmDeleteImageTitle: 'Удалить загруженное изображение?',
    confirmDeleteImageDescription: (label) => `Убрать "${label}" из этого Image Prank черновика?`,
    promptLabel: 'Промпт',
    modelLabel: 'Модель',
    defaultModelLabel: 'По умолчанию (Seedream)',
    twoImagePromptPlaceholder: 'Например: естественно поместить prank-картинку на целевое фото. Можно писать первое и второе изображение.',
    oneImagePromptPlaceholder: 'Например: превратить это изображение в смешную prank-сцену.',
    twoImageDefaultPrompt: 'Помести prank-картинку на целевое изображение так, чтобы она подходила по освещению, перспективе, масштабу и естественной позиции.',
    oneImageDefaultPrompt: 'Преврати это изображение в естественную prank-сцену, сохранив освещение, перспективу и реалистичное размещение.',
    twoImageHint: 'Prank-картинка - первое изображение. Целевое изображение - второе. Опишите, как первое должно вписаться во второе.',
    oneImageHint: 'Загрузите одно изображение и опишите prank-правку, которую нужно сделать.',
    twoImages: '2 изображения',
    oneImage: '1 изображение',
    zoomImage: 'Открыть предпросмотр изображения',
    create: 'Продолжить',
    confirmTitle: 'Подтвердите создание проекта',
    confirmWithdrawIntro: 'Будет списано',
    confirmWithdrawOutro: 'токенов для запуска генерации Image Prank.',
    confirmBalanceLabel: 'Баланс после создания:',
    confirmBalanceOutro: 'токенов.',
    confirmCreate: 'Подтвердить и создать',
    cancel: 'Отмена',
    topUpTitle: 'Пополнение через подписку',
    topUpDescription: 'Оформите подписку, чтобы автоматически получать токены после каждого успешного списания.',
    paywallCurrentBalance: (balance) => `Текущий баланс: ${balance.toLocaleString()} токенов.`,
    tokensPerCharge: 'токенов за списание',
    imagesPerPeriod: (images, period) => `${images} изображений/${period === 'week' ? 'неделю' : 'месяц'}`,
    videosPerPeriod: (videos, period) => `${videos} видео/${period === 'week' ? 'неделю' : 'месяц'}`,
    paywallPerPeriod: (period) => (period === 'week' ? 'неделю' : 'месяц'),
    paywallChipLabel: (planKey) => {
      if (planKey === 'weekly') return 'Просто попробовать';
      if (planKey === 'monthly') return 'Самый популярный';
      return 'Лучший выбор';
    },
    paywallSubscribeWithPrice: (amount, periodLabel) => `Подписаться • ${amount}/${periodLabel}`,
    openingCheckout: 'Открываем оплату...',
    toastPlanAlreadyActive: 'Этот план уже активен.',
    toastSubscriptionUpdated: 'Подписка обновлена.',
    toastOpenCheckoutFailed: 'Не удалось открыть оплату',
    loading: 'Загрузка',
    uploading: 'Загрузка',
    back: 'Назад',
    reuseLoadFailed: 'Не удалось загрузить прошлый Image Prank',
    missingPrompt: 'Введите промпт',
    promptTooLong: (max) => `Сократите промпт до ${max} символов`,
    missingImages: 'Загрузите нужные изображения',
    tokenLoadFailed: 'Не удалось загрузить баланс токенов',
    createFailed: 'Не удалось создать Image Prank',
  },
};

function pickTitle(item: ImagePrankCatalogItemDTO | null, language: AppLanguageCode) {
  if (!item) return '';
  return language === 'ru' ? item.title.ru || item.title.en : item.title.en || item.title.ru;
}

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function toPrefilledSource(source: ImagePrankSourceImageDTO | null | undefined, fallbackLabel: string): PrefilledSource | null {
  if (!source?.imagePath || !source.imageUrl) return null;
  return {
    role: source.role,
    path: source.imagePath,
    url: source.imageUrl,
    label: source.label || fallbackLabel,
    previewUrl: source.previewImageUrl || source.imageUrl,
    width: source.width ?? null,
    height: source.height ?? null,
  };
}

function UploadSlot({
  label,
  state,
  zoomUrl,
  onZoom,
  onDelete,
  deleteLabel,
  onChange,
  disabled,
}: {
  label: string;
  state: ImageSlotState;
  zoomUrl?: string | null;
  onZoom: (image: ZoomImage) => void;
  onDelete: (() => void) | null;
  deleteLabel: string;
  onChange: (file: File | null) => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const previewUrl = state.previewUrl;
  const fullUrl = zoomUrl || previewUrl;
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</Label>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />
      <div className="relative aspect-[9/16] w-full">
        {previewUrl ? (
          <button
            type="button"
            onClick={() => fullUrl && onZoom({ url: fullUrl, label })}
            disabled={disabled || !fullUrl}
            className="group flex h-full w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-center transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/30"
            aria-label={label}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={label} className="h-full w-full object-contain" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            disabled={disabled}
            className="group flex h-full w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 text-center transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/30"
          >
            <span className="flex flex-col items-center gap-2 p-4 text-sm text-gray-600 dark:text-gray-300">
              <UploadCloud className="h-6 w-6 text-blue-500" />
              {label}
            </span>
          </button>
        )}
        {previewUrl && onDelete ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            disabled={disabled}
            className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/60 bg-black/45 text-white opacity-80 shadow-sm backdrop-blur transition hover:bg-red-600/90 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:bg-red-600/90 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            aria-label={`${deleteLabel}: ${label}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

async function uploadSource(file: File, role: ImagePrankSourceImageRole, label: string, storageBaseUrl: string): Promise<UploadedSource> {
  const grant = await Api.createCharacterUploadToken({ maxBytes: IMAGE_PRANK_UPLOAD_MAX_BYTES });
  if (!grant?.data || !grant.signature) throw new Error('Upload authorization failed');
  const uploadFile = await prepareImageForStorage(file, grant.maxBytes);
  const dimensions = await readImageFileDimensions(uploadFile);
  if (!grant.mimeTypes.includes(uploadFile.type)) throw new Error('Selected file type is not allowed');
  if (uploadFile.size > grant.maxBytes) {
    throw new Error(`File is too large. Maximum size is ${Math.floor(grant.maxBytes / 1024 / 1024)}MB`);
  }

  const form = new FormData();
  form.set('file', uploadFile);
  form.set('data', grant.data);
  form.set('signature', grant.signature);

  const response = await fetch(`${storageBaseUrl.replace(/\/$/, '')}/api/storage/user-images`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Storage upload failed (${response.status})${text ? `: ${text}` : ''}`);
  }
  const payload = await response.json();
  if (!payload?.path || !payload?.url) throw new Error('Storage response missing image URL');
  return {
    role,
    path: payload.path,
    url: payload.url,
    label,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  };
}

function fileNameWithExtension(fileName: string, extension: string) {
  const base = fileName.trim().replace(/\.[a-z0-9]+$/i, '') || 'target-image';
  return `${base}.${extension}`;
}

function isSupportedUploadImage(file: File) {
  return file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp';
}

async function decodeImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to read image'));
    };
    image.src = url;
  });
}

async function readImageFileDimensions(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const decoded = await decodeImageFile(file);
    const width = decoded.naturalWidth;
    const height = decoded.naturalHeight;
    return width > 0 && height > 0 ? { width, height } : null;
  } catch {
    return null;
  }
}

async function prepareImageForStorage(file: File, maxBytes: number): Promise<File> {
  const decoded = await decodeImageFile(file);
  const width = decoded.naturalWidth;
  const height = decoded.naturalHeight;
  const maxDimension = Math.max(width, height);
  if (!width || !height) return file;
  if (maxDimension <= MAX_STORAGE_IMAGE_DIMENSION && file.size <= maxBytes && isSupportedUploadImage(file)) {
    return file;
  }

  let scale = Math.min(1, MAX_STORAGE_IMAGE_DIMENSION / maxDimension);
  const fileName = fileNameWithExtension(file.name, 'jpg');
  const qualitySteps = [0.92, 0.86, 0.8, 0.72, 0.64, 0.56, 0.48, 0.4];

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    for (const quality of qualitySteps) {
      const blob = await renderImageBlob(decoded, targetWidth, targetHeight, quality);
      if (blob.size <= maxBytes) {
        return new File([blob], fileName, { type: 'image/jpeg' });
      }
    }
    scale *= 0.85;
  }

  throw new Error(`File is too large. Maximum size is ${Math.floor(maxBytes / 1024 / 1024)}MB`);
}

async function renderImageBlob(decoded: HTMLImageElement, targetWidth: number, targetHeight: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(decoded, 0, 0, targetWidth, targetHeight);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((output) => resolve(output), 'image/jpeg', quality);
  });
  if (!blob) throw new Error('Failed to resize image');
  return blob;
}

export function ImagePrankComposer({ item }: { item?: ImagePrankCatalogItemDTO | null }) {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const router = useRouter();
  const searchParams = useSearchParams();
  const { summary, setSummary, refresh } = useTokenSummary();
  const storageBaseUrl = useMemo(resolveStorageBaseUrl, []);
  const reuseProjectId = searchParams.get('reuseProjectId')?.trim() || null;
  const requestedModel = toSelectableModelOverride(normalizeSelectableImagePrankGenerationModel(searchParams.get('model')));
  const promptPrefill = normalizeImagePrankPromptPrefill(searchParams.get(IMAGE_PRANK_PROMPT_PREFILL_PARAM));
  const [selectedModel, setSelectedModel] = useState<ImagePrankSelectableModel | null>(requestedModel);
  const [prompt, setPrompt] = useState(() => promptPrefill ?? copy.twoImageDefaultPrompt);
  const [oneImageMode, setOneImageMode] = useState(false);
  const [prankFile, setPrankFile] = useState<File | null>(null);
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [prankSource, setPrankSource] = useState<PrefilledSource | null>(null);
  const [targetSource, setTargetSource] = useState<PrefilledSource | null>(null);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [tokenCost, setTokenCost] = useState(TOKEN_COSTS.actions.imageGeneration);
  const [tokenInfoLoading, setTokenInfoLoading] = useState(false);
  const [reuseLoading, setReuseLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [deleteImageTarget, setDeleteImageTarget] = useState<DeleteImageTarget | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlanKey | null>(null);
  const [selectedPlanKey, setSelectedPlanKey] = useState<SubscriptionPlanKey>('monthly');
  const [submitting, setSubmitting] = useState(false);
  const [zoomImage, setZoomImage] = useState<ZoomImage | null>(null);
  const prankPreviewUrl = useObjectUrl(prankFile);
  const targetPreviewUrl = useObjectUrl(targetFile);
  const prankSlotPreviewUrl = prankPreviewUrl || prankSource?.previewUrl || prankSource?.url || null;
  const targetSlotPreviewUrl = targetPreviewUrl || targetSource?.previewUrl || targetSource?.url || null;
  const prankSlotZoomUrl = prankPreviewUrl || prankSource?.url || prankSlotPreviewUrl;
  const targetSlotZoomUrl = targetPreviewUrl || targetSource?.url || targetSlotPreviewUrl;
  const isCatalogMode = !!item;
  const mode: ImagePrankMode = isCatalogMode
    ? 'catalog'
    : oneImageMode
      ? 'custom-one-image'
      : 'custom-two-image';
  const itemTitle = pickTitle(item ?? null, language);
  const imageHint = oneImageMode && !item ? copy.oneImageHint : copy.twoImageHint;
  const promptPlaceholder = oneImageMode && !item ? copy.oneImagePromptPlaceholder : copy.twoImagePromptPlaceholder;
  const defaultPrompt = oneImageMode && !item ? copy.oneImageDefaultPrompt : copy.twoImageDefaultPrompt;
  const projectedBalance = Math.max(tokenBalance - tokenCost, 0);
  const subscriptionPlans = getSubscriptionPlansForUi();
  const selectedPlan = subscriptionPlans.find((plan) => plan.planKey === selectedPlanKey) ?? subscriptionPlans[0] ?? null;
  const selectedPerLabel = selectedPlan ? copy.paywallPerPeriod(selectedPlan.interval) : copy.paywallPerPeriod('month');
  const selectedPlanAmount = selectedPlan ? `$${selectedPlan.priceUsd.toFixed(2)}` : '$0.00';

  useEffect(() => {
    setPrompt((current) => {
      const defaults = Object.values(COPY).flatMap((entry) => [
        entry.twoImageDefaultPrompt,
        entry.oneImageDefaultPrompt,
      ]);
      return current.trim() === '' || defaults.includes(current) ? promptPrefill ?? defaultPrompt : current;
    });
  }, [defaultPrompt, promptPrefill]);

  useEffect(() => {
    if (!reuseProjectId) return;
    let cancelled = false;
    setReuseLoading(true);
    Api.getImagePrankReuse(reuseProjectId)
      .then((draft) => {
        if (cancelled) return;
        if (!item) {
          setOneImageMode(draft.mode === 'custom-one-image');
        }
        const prank = draft.sourceImages.find((source) => source.role === 'prank') ?? null;
        const target =
          draft.sourceImages.find((source) => source.role === 'target')
          ?? draft.sourceImages.find((source) => source.role === 'reference')
          ?? null;
        setPrompt(draft.prompt || defaultPrompt);
        if (!requestedModel) {
          setSelectedModel(toSelectableModelOverride(normalizeSelectableImagePrankGenerationModel(draft.model)));
        }
        setPrankFile(null);
        setTargetFile(null);
        setPrankSource(toPrefilledSource(prank, copy.prankImage));
        setTargetSource(toPrefilledSource(target, draft.mode === 'custom-one-image' ? copy.referenceImage : copy.targetImage));
      })
      .catch(() => {
        if (!cancelled) {
          toast.error(copy.reuseLoadFailed);
        }
      })
      .finally(() => {
        if (!cancelled) setReuseLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [copy.prankImage, copy.referenceImage, copy.reuseLoadFailed, copy.targetImage, defaultPrompt, item, requestedModel, reuseProjectId]);

  useEffect(() => {
    if (!summary) return;
    setTokenBalance(summary.balance);
    setTokenCost(summary.actionCosts.imageGeneration ?? TOKEN_COSTS.actions.imageGeneration);
  }, [summary]);

  useEffect(() => {
    if (subscriptionPlans.some((plan) => plan.planKey === selectedPlanKey)) return;
    if (subscriptionPlans[0]) {
      setSelectedPlanKey(subscriptionPlans[0].planKey);
    }
  }, [selectedPlanKey, subscriptionPlans]);

  useEffect(() => {
    let cancelled = false;
    Api.getTokenSummary()
      .then((summary) => {
        if (cancelled) return;
        setTokenBalance(summary.balance);
        setTokenCost(summary.actionCosts.imageGeneration ?? TOKEN_COSTS.actions.imageGeneration);
      })
      .catch(() => {
        if (!cancelled) toast.error(copy.tokenLoadFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [copy.tokenLoadFailed]);

  const validate = () => {
    if (!prompt.trim()) {
      toast.error(copy.missingPrompt);
      return false;
    }
    if (promptCharacterCount(prompt.trim()) > IMAGE_PRANK_WEB_USER_PROMPT_MAX_CHARACTERS) {
      toast.error(copy.promptTooLong(IMAGE_PRANK_WEB_USER_PROMPT_MAX_CHARACTERS));
      return false;
    }
    if (isCatalogMode && !targetFile && !targetSource) {
      toast.error(copy.missingImages);
      return false;
    }
    if (!isCatalogMode && !oneImageMode && ((!prankFile && !prankSource) || (!targetFile && !targetSource))) {
      toast.error(copy.missingImages);
      return false;
    }
    if (!isCatalogMode && oneImageMode && !targetFile && !targetSource) {
      toast.error(copy.missingImages);
      return false;
    }
    return true;
  };

  const handleContinue = async () => {
    if (submitting || !validate()) return;
    setConfirmOpen(true);
    setTokenInfoLoading(true);
    let balanceForDecision = tokenBalance;
    try {
      const latestSummary = await refresh().catch(() => null);
      if (latestSummary) {
        balanceForDecision = latestSummary.balance;
        setTokenBalance(balanceForDecision);
      }
    } catch {
      toast.error(copy.tokenLoadFailed);
    } finally {
      setTokenInfoLoading(false);
    }
    if (balanceForDecision < tokenCost) {
      setSelectedPlanKey('monthly');
      setConfirmOpen(false);
      setPaywallOpen(true);
      return;
    }
  };

  const handleSubmit = async () => {
    if (submitting || tokenInfoLoading || !validate()) return;
    if (tokenBalance < tokenCost) {
      setConfirmOpen(false);
      setSelectedPlanKey('monthly');
      setPaywallOpen(true);
      return;
    }
    setSubmitting(true);
    try {
      const uploaded: UploadedSource[] = [];
      if (isCatalogMode) {
        uploaded.push(targetFile
          ? await uploadSource(targetFile, 'target', copy.targetImage, storageBaseUrl)
          : { ...targetSource!, role: 'target', label: targetSource?.label || copy.targetImage });
      } else if (oneImageMode) {
        uploaded.push(targetFile
          ? await uploadSource(targetFile, 'target', copy.referenceImage, storageBaseUrl)
          : { ...targetSource!, role: 'target', label: targetSource?.label || copy.referenceImage });
      } else {
        const [prank, target] = await Promise.all([
          prankFile
            ? uploadSource(prankFile, 'prank', copy.prankImage, storageBaseUrl)
            : Promise.resolve({ ...prankSource!, role: 'prank' as const, label: prankSource?.label || copy.prankImage }),
          targetFile
            ? uploadSource(targetFile, 'target', copy.targetImage, storageBaseUrl)
            : Promise.resolve({ ...targetSource!, role: 'target' as const, label: targetSource?.label || copy.targetImage }),
        ]);
        uploaded.push(prank, target);
      }

      const payload = {
        prompt: prompt.trim(),
        projectExperience: 'image-generation',
        imagePrank: {
          mode,
          ...(item ? { catalogItemId: item.id } : {}),
          ...(selectedModel ? { model: selectedModel } : {}),
          sourceImages: uploaded.map((source) => ({
            role: source.role,
            path: source.path,
            url: source.url,
            label: source.label,
            width: source.width ?? undefined,
            height: source.height ?? undefined,
          })),
        },
      };
      const res = await Api.createProject(payload);
      setSummary?.((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          balance: Math.max(prev.balance - tokenCost, 0),
        };
      });
      Api.getTokenSummary()
        .then((nextSummary) => setSummary?.(nextSummary))
        .catch(() => {});
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('project:created', { detail: res }));
      }
      requestTokenRefresh();
      setConfirmOpen(false);
      router.replace(`/project/${res.id}?placeholder=image-prank`);
    } catch (err) {
      console.error('Image prank creation failed', err);
      toast.error(err instanceof Error ? err.message : copy.createFailed);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  };

  const requestDeleteSlot = (slot: DeleteImageTarget['slot'], label: string) => {
    setDeleteImageTarget({ slot, label });
  };

  const confirmDeleteSlot = () => {
    if (!deleteImageTarget) return;
    if (deleteImageTarget.slot === 'prank') {
      setPrankFile(null);
      setPrankSource(null);
    } else {
      setTargetFile(null);
      setTargetSource(null);
    }
    setDeleteImageTarget(null);
  };

  async function openSubscriptionCheckout(plan: SubscriptionPlanKey) {
    if (checkoutPlan) return;
    setCheckoutPlan(plan);
    try {
      const result = await Api.createSubscriptionCheckout(plan);
      if (result.action === 'checkout') {
        window.location.href = result.url;
      } else if (result.action === 'already_on_plan') {
        toast.info(copy.toastPlanAlreadyActive);
      } else {
        toast.success(copy.toastSubscriptionUpdated);
      }
    } catch (error) {
      console.error('Failed to open subscription checkout', error);
      toast.error(copy.toastOpenCheckoutFailed);
    } finally {
      setCheckoutPlan(null);
    }
  }

  return (
    <>
      <div className="mx-auto w-full max-w-6xl space-y-5 px-3 pb-14 pt-2 sm:px-4 lg:px-0">
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {copy.back}
          </button>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{copy.title}</h1>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
          <div className="grid grid-cols-2 gap-3 self-start">
            {item ? (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-900 dark:text-gray-100">{copy.catalogLabel}</Label>
                <button
                  type="button"
                  onClick={() => setZoomImage({ url: item.imageUrl, label: itemTitle || copy.catalogLabel })}
                  className="relative flex aspect-[9/16] w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/30"
                  aria-label={`${copy.zoomImage}: ${itemTitle || copy.catalogLabel}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.previewImageUrl || item.imageUrl} alt={itemTitle} className="h-full w-full object-contain" />
                </button>
              </div>
            ) : oneImageMode ? null : (
              <UploadSlot
                label={copy.prankImage}
                state={{ file: prankFile, previewUrl: prankSlotPreviewUrl }}
                zoomUrl={prankSlotZoomUrl}
                onZoom={setZoomImage}
                onDelete={prankSlotPreviewUrl ? () => requestDeleteSlot('prank', copy.prankImage) : null}
                deleteLabel={copy.deleteImage}
                onChange={(file) => {
                  setPrankFile(file);
                  setPrankSource(null);
                }}
                disabled={submitting || reuseLoading}
              />
            )}
            <UploadSlot
              label={oneImageMode && !item ? copy.referenceImage : copy.targetImage}
              state={{ file: targetFile, previewUrl: targetSlotPreviewUrl }}
              zoomUrl={targetSlotZoomUrl}
              onZoom={setZoomImage}
              onDelete={targetSlotPreviewUrl ? () => requestDeleteSlot('target', oneImageMode && !item ? copy.referenceImage : copy.targetImage) : null}
              deleteLabel={copy.deleteImage}
              onChange={(file) => {
                setTargetFile(file);
                setTargetSource(null);
              }}
              disabled={submitting || reuseLoading}
            />
            <p className="col-span-2 text-sm leading-5 text-gray-600 dark:text-gray-400">
              {imageHint}
            </p>
          </div>

          <div className="flex flex-col gap-3 self-start">
            <div className="flex flex-col space-y-2">
              <Label htmlFor="image-prank-prompt" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {copy.promptLabel}
              </Label>
              <Textarea
                id="image-prank-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={promptPlaceholder}
                className="h-[160px] resize-none sm:h-[170px] lg:h-[190px]"
                disabled={submitting || reuseLoading}
              />
              <p className={cn(
                'text-right text-xs',
                promptCharacterCount(prompt.trim()) > IMAGE_PRANK_WEB_USER_PROMPT_MAX_CHARACTERS
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500 dark:text-gray-400',
              )}>
                {promptCharacterCount(prompt.trim())}/{IMAGE_PRANK_WEB_USER_PROMPT_MAX_CHARACTERS}
              </p>
            </div>

            <div className="grid items-end gap-3 lg:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]">
              <div className="grid gap-2">
                <Label htmlFor="image-prank-model" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {copy.modelLabel}
                </Label>
                <Select
                  value={selectedModel ?? DEFAULT_MODEL_SELECT_VALUE}
                  onValueChange={(value) => {
                    setSelectedModel(value === DEFAULT_MODEL_SELECT_VALUE ? null : normalizeSelectableImagePrankGenerationModel(value));
                  }}
                  disabled={submitting || reuseLoading}
                >
                  <SelectTrigger id="image-prank-model" className="h-9 cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_MODEL_SELECT_VALUE} className="cursor-pointer">
                      {copy.defaultModelLabel}
                    </SelectItem>
                    {IMAGE_PRANK_SELECTABLE_MODEL_OPTIONS.filter((model) => !model.isDefault).map((model) => (
                      <SelectItem key={model.id} value={model.id} className="cursor-pointer">
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!item ? (
                <div className="inline-flex h-9 w-full items-center gap-1 rounded-full border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900">
                  {[
                    { value: false, label: copy.twoImages, Icon: Images },
                    { value: true, label: copy.oneImage, Icon: ImagePlus },
                  ].map((option) => {
                    const active = oneImageMode === option.value;
                    const OptionIcon = option.Icon;
                    return (
                      <button
                        key={String(option.value)}
                        type="button"
                        onClick={() => {
                          setOneImageMode(option.value);
                          if (option.value) {
                            setPrankFile(null);
                            setPrankSource(null);
                          }
                        }}
                        className={cn(
                          'inline-flex h-7 min-w-0 cursor-pointer items-center gap-1 rounded-full px-3 text-sm font-medium leading-none transition-[background-color,color,box-shadow]',
                          active
                            ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.35)]'
                            : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white',
                        )}
                        aria-pressed={active}
                        disabled={submitting || reuseLoading}
                      >
                        <OptionIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="inline-flex min-w-0 items-center whitespace-nowrap leading-none">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <Button type="button" className="h-10 w-full cursor-pointer" onClick={() => void handleContinue()} disabled={submitting || reuseLoading}>
              {submitting || reuseLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
              {submitting ? copy.uploading : reuseLoading ? copy.loading : copy.create}
            </Button>
          </div>
        </div>
      </div>

      <ImagePreviewDialog
        image={zoomImage}
        openLabel={copy.zoomImage}
        onOpenChange={(open) => {
          if (!open) setZoomImage(null);
        }}
      />

      <Dialog open={!!deleteImageTarget} onOpenChange={(open) => !open && setDeleteImageTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{copy.confirmDeleteImageTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {copy.confirmDeleteImageDescription(deleteImageTarget?.label ?? '')}
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" className="cursor-pointer" onClick={() => setDeleteImageTarget(null)}>
              {copy.cancel}
            </Button>
            <Button type="button" variant="destructive" className="cursor-pointer" onClick={confirmDeleteSlot}>
              <Trash2 className="mr-2 h-4 w-4" />
              {copy.deleteImage}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{copy.confirmTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {copy.confirmWithdrawIntro}{' '}
            <span className="font-semibold text-gray-900 dark:text-gray-100">{tokenCost}</span>{' '}
            {copy.confirmWithdrawOutro}{' '}
            {copy.confirmBalanceLabel}{' '}
            <span className="inline-flex min-w-5 items-center justify-center font-semibold text-gray-900 dark:text-gray-100">
              {tokenInfoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label={copy.loading} /> : projectedBalance}
            </span>{' '}
            {copy.confirmBalanceOutro}
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              {copy.cancel}
            </Button>
            <Button
              type="button"
              className="cursor-pointer"
              onClick={() => void handleSubmit()}
              disabled={submitting || tokenInfoLoading}
            >
              {submitting || tokenInfoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {copy.confirmCreate}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={paywallOpen} onOpenChange={setPaywallOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-[1040px]">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              {copy.topUpTitle}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {copy.topUpDescription}
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {copy.paywallCurrentBalance(tokenBalance)}
          </p>
          <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subscriptionPlans.map((plan) => {
              const isSelected = selectedPlan?.planKey === plan.planKey;
              const perLabel = copy.paywallPerPeriod(plan.interval);
              return (
                <button
                  type="button"
                  key={plan.planKey}
                  onClick={() => setSelectedPlanKey(plan.planKey)}
                  disabled={checkoutPlan !== null}
                  className={[
                    'relative mt-3 min-w-0 cursor-pointer rounded-2xl border p-5 pt-6 text-left transition-[border-color,box-shadow,background-color,transform] duration-200 ease-out will-change-transform',
                    isSelected
                      ? 'border-blue-400 bg-blue-50/60 shadow-[0_12px_28px_rgba(37,99,235,0.18)] dark:border-blue-700 dark:bg-blue-950/25'
                      : 'border-gray-200 bg-white hover:scale-[1.01] hover:border-blue-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900/40 dark:hover:border-blue-800',
                  ].join(' ')}
                >
                  <div className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 rounded-full border border-amber-300/80 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-200">
                    {copy.paywallChipLabel(plan.planKey)}
                  </div>
                  <div className="flex items-end justify-center gap-1 whitespace-nowrap">
                    <span className="text-4xl font-bold leading-none text-gray-900 dark:text-gray-100">${plan.priceUsd.toFixed(2)}</span>
                    <span className="pb-0.5 text-lg text-gray-500 dark:text-gray-400">/{perLabel}</span>
                  </div>
                  <div className="mt-4 space-y-1.5 text-base text-gray-700 dark:text-gray-300">
                    {plan.ui.benefits.map((benefit, benefitIndex) => {
                      if (benefit.key === 'tokens_per_charge' && typeof benefit.tokens === 'number') {
                        return <p key={`${plan.planKey}-benefit-${benefitIndex}`}>{benefit.tokens.toLocaleString()} {copy.tokensPerCharge}</p>;
                      }
                      if (benefit.key === 'images_per_period' && typeof benefit.images === 'number' && benefit.interval) {
                        return <p key={`${plan.planKey}-benefit-${benefitIndex}`}>{copy.imagesPerPeriod(benefit.images.toLocaleString(), benefit.interval)}</p>;
                      }
                      if (benefit.key === 'videos_per_period' && typeof benefit.videos === 'number' && benefit.interval) {
                        return <p key={`${plan.planKey}-benefit-${benefitIndex}`}>{copy.videosPerPeriod(formatSubscriptionVideoCountForPaywall(benefit.videos), benefit.interval)}</p>;
                      }
                      return null;
                    })}
                  </div>
                </button>
              );
            })}
          </div>
          <Button
            type="button"
            className="brainrot-cta-gradient mx-auto mt-5 flex h-14 w-full max-w-[352px] cursor-pointer items-center justify-center rounded-full border-0 px-6 text-base font-semibold text-black shadow-lg outline-none transition hover:text-black hover:shadow-xl focus-visible:outline-none"
            onClick={() => {
              if (!selectedPlan) return;
              void openSubscriptionCheckout(selectedPlan.planKey);
            }}
            disabled={checkoutPlan !== null || !selectedPlan}
          >
            {checkoutPlan ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {copy.openingCheckout}
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                {copy.paywallSubscribeWithPrice(selectedPlanAmount, selectedPerLabel)}
              </>
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
