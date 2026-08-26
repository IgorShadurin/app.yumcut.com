import type { AppLanguageCode } from '@/shared/constants/app-language';

type TokenLowBalanceAlertProps = {
  language: AppLanguageCode;
  buyTokensLabel: string;
  tokenWarning: (projectCost: number, tokenBalance: number, duration: number, useExact: boolean) => string;
  projectCost: number;
  tokenBalance: number;
  effectiveDuration: number;
  minimumProjectSeconds: number;
  useExact: boolean;
};

export function TokenLowBalanceAlert({
  language,
  buyTokensLabel,
  tokenWarning,
  projectCost,
  tokenBalance,
  effectiveDuration,
  minimumProjectSeconds,
  useExact,
}: TokenLowBalanceAlertProps) {
  const showRuHowToVideo = language === 'ru' && tokenBalance < projectCost;

  return (
    <>
      <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200 text-sm">
        {language === 'ru' ? (
          <p>
            {tokenBalance < projectCost ? (
              <>
                <span className="font-semibold">Не хватает токенов!</span>{' '}
                Пополните баланс через{' '}
                <a
                  className="cursor-pointer underline underline-offset-2 hover:text-rose-800 dark:hover:text-rose-100"
                  href="/account"
                >
                  Stripe
                </a>{' '}
                или купите токены через{' '}
                <a
                  className="cursor-pointer underline underline-offset-2 hover:text-rose-800 dark:hover:text-rose-100"
                  href="https://apps.apple.com/app/yumcut-ai-video-generator/id6755393914"
                  rel="noreferrer"
                  target="_blank"
                >
                  iOS-приложение
                </a>
                .
              </>
            ) : (
              <>
                Остался минимальный баланс. Пополните его через{' '}
                <a
                  className="cursor-pointer underline underline-offset-2 hover:text-rose-800 dark:hover:text-rose-100"
                  href="/account"
                >
                  Stripe
                </a>{' '}
                или купите токены через{' '}
                <a
                  className="cursor-pointer underline underline-offset-2 hover:text-rose-800 dark:hover:text-rose-100"
                  href="https://apps.apple.com/app/yumcut-ai-video-generator/id6755393914"
                  rel="noreferrer"
                  target="_blank"
                >
                  iOS-приложение
                </a>
                .
              </>
            )}
          </p>
        ) : (
          <>
            <a
              className="font-semibold underline underline-offset-2 hover:text-rose-800 dark:hover:text-rose-100"
              href="https://apps.apple.com/app/yumcut-ai-video-generator/id6755393914"
              rel="noreferrer"
              target="_blank"
            >
              {buyTokensLabel}
            </a>{' '}
            {tokenWarning(
              projectCost,
              tokenBalance,
              Math.max(effectiveDuration, minimumProjectSeconds),
              useExact,
            )}
          </>
        )}
      </div>
      {showRuHowToVideo ? (
        <div className="mt-2 rounded-md border border-gray-200 bg-white p-3 text-sm dark:border-gray-800 dark:bg-gray-950">
          <p className="font-semibold text-gray-900 dark:text-gray-100">Как пользоваться сайтом?</p>
          <div className="mt-2 overflow-hidden rounded-md border border-gray-200 dark:border-gray-800">
            <iframe
              className="aspect-video w-full"
              src="https://www.youtube.com/embed/RJ_JDwe2oLc"
              title="Как пользоваться сайтом?"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
