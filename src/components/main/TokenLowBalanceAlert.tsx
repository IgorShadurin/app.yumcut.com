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
  return (
    <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200 text-sm">
      {language === 'ru' ? (
        <p>
          {tokenBalance < projectCost ? (
            <>
              <span className="font-semibold">Не хватает токенов!</span>{' '}
              Можете купить их через{' '}
              <a
                className="underline underline-offset-2 hover:text-rose-800 dark:hover:text-rose-100"
                href="https://apps.apple.com/app/yumcut-ai-video-generator/id6755393914"
                rel="noreferrer"
                target="_blank"
              >
                iOS приложение
              </a>
              , или напишите в{' '}
              <a
                className="underline underline-offset-2 hover:text-rose-800 dark:hover:text-rose-100"
                href="http://t.me/IgorDvlpr"
                rel="noreferrer"
                target="_blank"
              >
                Telegram
              </a>
              , или на{' '}
              <a
                className="underline underline-offset-2 hover:text-rose-800 dark:hover:text-rose-100"
                href="mailto:igor.shadurin@gmail.com"
              >
                email
              </a>
              .
            </>
          ) : (
            <>
              Остался минимальный баланс. Купить токены можно через{' '}
              <a
                className="underline underline-offset-2 hover:text-rose-800 dark:hover:text-rose-100"
                href="https://apps.apple.com/app/yumcut-ai-video-generator/id6755393914"
                rel="noreferrer"
                target="_blank"
              >
                iOS приложение
              </a>
              , в{' '}
              <a
                className="underline underline-offset-2 hover:text-rose-800 dark:hover:text-rose-100"
                href="http://t.me/IgorDvlpr"
                rel="noreferrer"
                target="_blank"
              >
                Telegram
              </a>{' '}
              или по{' '}
              <a
                className="underline underline-offset-2 hover:text-rose-800 dark:hover:text-rose-100"
                href="mailto:igor.shadurin@gmail.com"
              >
                email
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
  );
}
