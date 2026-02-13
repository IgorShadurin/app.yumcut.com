"use client";
import { ProjectStatus } from '@/shared/constants/status';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

export function StatusPanel({ status, info }: { status: ProjectStatus | string; info?: any }) {
  const { language } = useAppLanguage();
  const copy: Record<AppLanguageCode, {
    scriptGeneration: string;
    scriptReady: string;
    audioGeneration: string;
    audioReady: string;
    transcription: string;
    metadata: string;
    captions: string;
    images: string;
    videoParts: string;
    finalVideo: string;
    error: string;
    unknownError: string;
    done: string;
    download: string;
    link: string;
    notAvailable: string;
    cancelled: string;
    queued: string;
  }> = {
    en: {
      scriptGeneration: 'Script generation in progress.',
      scriptReady: 'Script ready for validation.',
      audioGeneration: 'Audio generation in progress.',
      audioReady: 'Audio ready for approval.',
      transcription: 'Transcribing the approved voiceover.',
      metadata: 'Generating video metadata.',
      captions: 'Rendering captions overlay.',
      images: 'Image generation in progress.',
      videoParts: 'Video parts generation in progress.',
      finalVideo: 'Compiling final video.',
      error: 'Error',
      unknownError: 'Unknown error',
      done: 'Done.',
      download: 'Download',
      link: 'link',
      notAvailable: 'not available',
      cancelled: 'Cancelled.',
      queued: 'Queued.',
    },
    ru: {
      scriptGeneration: 'Идёт генерация сценария.',
      scriptReady: 'Сценарий готов к проверке.',
      audioGeneration: 'Идёт генерация озвучки.',
      audioReady: 'Озвучка готова к подтверждению.',
      transcription: 'Выполняется транскрибация выбранной озвучки.',
      metadata: 'Генерируем метаданные видео.',
      captions: 'Рендерим слой субтитров.',
      images: 'Идёт генерация изображений.',
      videoParts: 'Идёт рендеринг частей видео.',
      finalVideo: 'Собираем финальное видео.',
      error: 'Ошибка',
      unknownError: 'Неизвестная ошибка',
      done: 'Готово.',
      download: 'Скачать',
      link: 'ссылка',
      notAvailable: 'недоступно',
      cancelled: 'Отменено.',
      queued: 'В очереди.',
    },
  };
  const t = copy[language];

  const s = status as ProjectStatus;
  switch (s) {
    case ProjectStatus.ProcessScript:
      return <div>{t.scriptGeneration}</div>;
    case ProjectStatus.ProcessScriptValidate:
      return <div>{t.scriptReady}</div>;
    case ProjectStatus.ProcessAudio:
      return <div>{t.audioGeneration}</div>;
    case ProjectStatus.ProcessAudioValidate:
      return <div>{t.audioReady}</div>;
    case ProjectStatus.ProcessTranscription:
      return <div>{t.transcription}</div>;
    case ProjectStatus.ProcessMetadata:
      return <div>{t.metadata}</div>;
    case ProjectStatus.ProcessCaptionsVideo:
      return <div>{t.captions}</div>;
    case ProjectStatus.ProcessImagesGeneration:
      return <div>{t.images}</div>;
    case ProjectStatus.ProcessVideoPartsGeneration:
      return <div>{t.videoParts}</div>;
    case ProjectStatus.ProcessVideoMain:
      return <div>{t.finalVideo}</div>;
    case ProjectStatus.Error:
      return <div className="text-red-600">{t.error}: {info?.message || t.unknownError}</div>;
    case ProjectStatus.Done:
      return <div>{t.done} {t.download}: {info?.url ? <a className="underline" href={info.url}>{t.link}</a> : t.notAvailable}</div>;
    case ProjectStatus.Cancelled:
      return <div>{t.cancelled}</div>;
    default:
      return <div>{t.queued}</div>;
  }
}
