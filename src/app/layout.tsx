import type { Metadata, Viewport } from "next";
import { Suspense } from 'react';
import { APP_NAME, CONTACT_EMAIL } from '@/shared/constants/app';
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProviders } from '@/components/providers/SessionProviders';
import { SettingsProvider } from '@/components/providers/SettingsProvider';
import { TokenProvider } from '@/components/providers/TokenProvider';
import { ProjectsProvider } from '@/components/providers/ProjectsProvider';
import { AuthGate } from '@/components/auth/AuthGate';
import { getAuthSession } from '@/server/auth';
import { AppHeader } from '@/components/layout/AppHeader';
import { Sidebar } from '@/components/layout/Sidebar';
import { prisma } from '@/server/db';
import { Toaster } from '@/components/ui/sonner';
import { UtmSourceTracker } from '@/components/analytics/UtmSourceTracker';
import { config } from '@/server/config';
import { TOKEN_COSTS, MINIMUM_PROJECT_TOKENS } from '@/shared/constants/token-costs';
import { DEFAULT_LANGUAGE, normalizeLanguageList } from '@/shared/constants/languages';
import { parseStoredCharacterSelection, resolveCharacterSelectionSnapshot } from '@/server/characters/selection';
import { getDefaultVoiceExternalId } from '@/server/voices';
import { ensureSchedulerPreferences } from '@/server/publishing/preferences';
import { normalizeLanguageVoiceMap } from '@/shared/voices/language-voice-map';
import {
  DEFAULT_APP_LANGUAGE,
  normalizeAppLanguage,
  type AppLanguageCode,
} from '@/shared/constants/app-language';
import { AppLanguageProvider } from '@/components/providers/AppLanguageProvider';
import { AppLanguageQuerySync } from '@/components/providers/AppLanguageQuerySync';
import Script from "next/script";

const IS_BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build' || process.env.NEXT_PHASE === 'phase-export';
const SKIP_BUILD_PRERENDER =
  process.env.SKIP_PRERENDER === '1' ||
  process.env.CI === 'true' ||
  (process.env.DATABASE_URL || '').includes('placeholder') ||
  IS_BUILD_PHASE;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_TITLE = `${APP_NAME} | Instant Viral Faceless Shorts Builder`;
const DESCRIPTION =
  'Create vertical 9:16 videos from ideas or scripts in minutes. Write a prompt, pick a voice and character, and YumCut generates the script, voiceover, visuals and final video for you.';

export const metadata: Metadata = {
  title: APP_TITLE,
  description: DESCRIPTION,
  applicationName: APP_NAME,
  authors: [{ name: 'YumCut Team' }],
  creator: 'YumCut',
  publisher: 'YumCut',
  keywords: [
    'AI video generator',
    'text to video',
    'script to video',
    'AI voiceover',
    'vertical video',
    'shorts',
    'reels',
    'tiktok video',
    'content creator tools',
    'YumCut', 'yum cut', 'yumcut', 'yum cat', 'yumcat', 'yam cut', 'yamcut', 'yam cat',
  ],
  metadataBase: config.NEXTAUTH_URL ? new URL(config.NEXTAUTH_URL) : undefined,
  alternates: {
    canonical: config.NEXTAUTH_URL || undefined,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: config.NEXTAUTH_URL || undefined,
    siteName: APP_NAME,
    title: APP_TITLE,
    description: DESCRIPTION,
    images: [
      { url: '/icon.png', width: 512, height: 512, alt: APP_NAME },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_TITLE,
    description: DESCRIPTION,
    images: ['/icon.png'],
  },
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png' }],
    apple: [{ url: '/icon.png', type: 'image/png' }],
  },
  other: {
    referrer: 'strict-origin-when-cross-origin',
    'geo.region': 'US',
    'content-language': 'en',
    language: 'en',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#141414' },
  ],
};

function StructuredData() {
  const base = config.NEXTAUTH_URL || '';
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${base}/#organization`,
      name: APP_NAME,
      url: base || undefined,
      logo: {
        '@type': 'ImageObject',
        url: `${base}/icon.png`,
        width: 512,
        height: 512,
      },
      description: 'Short‑form video generator that turns a single prompt into a finished 9:16 clip with script, voice and visuals.',
      contactPoint: {
        '@type': 'ContactPoint',
        email: CONTACT_EMAIL,
        contactType: 'customer service',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${base}/#website`,
      url: base || undefined,
      name: APP_NAME,
      inLanguage: 'en-US',
      publisher: { '@id': `${base}/#organization` },
      description: DESCRIPTION,
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${base}/#software`,
      name: APP_NAME,
      description: DESCRIPTION,
      applicationCategory: 'VideoObject',
      operatingSystem: 'Web',
      url: base || undefined,
    },
  ];
  const jsonLd = { '@context': 'https://schema.org', '@graph': graph } as any;
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const defaultVoiceId = SKIP_BUILD_PRERENDER ? null : await getDefaultVoiceExternalId();

  const defaultScheduler = ensureSchedulerPreferences();
  const makeDefaultSettings = (sidebarOpen: boolean): import('@/shared/types').UserSettingsDTO => ({
    includeDefaultMusic: true,
    addOverlay: true,
    includeCallToAction: true,
    autoApproveScript: true,
    autoApproveAudio: true,
    watermarkEnabled: true,
    captionsEnabled: true,
    defaultDurationSeconds: null,
    sidebarOpen,
    defaultUseScript: false,
    targetLanguages: ['en'],
    languageVoicePreferences: {},
    scriptCreationGuidanceEnabled: false,
    scriptCreationGuidance: '',
    scriptAvoidanceGuidanceEnabled: false,
    scriptAvoidanceGuidance: '',
    audioStyleGuidanceEnabled: false,
    audioStyleGuidance: '',
    characterSelection: null,
    preferredVoiceId: defaultVoiceId,
    preferredTemplateId: null,
    schedulerDefaultTimes: defaultScheduler.times,
    schedulerCadence: defaultScheduler.cadence,
  });
  const skipInitialData = SKIP_BUILD_PRERENDER;
  const session = skipInitialData ? null : await getAuthSession();
  // Derive initial sidebar state on the server to avoid layout shift on first paint
  let initialSidebarOpen = false;
  let initialSettings: import('@/shared/types').UserSettingsDTO | null = null;
  let initialTokens: import('@/shared/types').TokenSummaryDTO | null = null;
  let initialAppLanguage: AppLanguageCode = DEFAULT_APP_LANGUAGE;
  if (!skipInitialData && session?.user && (session.user as any).id) {
    const userId = (session.user as any).id as string;
    try {
      const [settingsRecord, count, userRecord] = await Promise.all([
        prisma.userSettings.findUnique({ where: { userId } }),
        prisma.project.count({ where: { userId, deleted: false } }),
        prisma.user.findUnique({ where: { id: userId }, select: { tokenBalance: true, preferredLanguage: true } }),
      ]);
      initialAppLanguage = normalizeAppLanguage((userRecord as any)?.preferredLanguage, DEFAULT_APP_LANGUAGE);
      const ensureOpen = count > 0;
      const sidebarOpen = ensureOpen
        ? (settingsRecord?.sidebarOpen ?? true)
        : false;
      initialSidebarOpen = sidebarOpen;
      const storedSelection = parseStoredCharacterSelection((settingsRecord as any)?.preferredCharacter ?? null);
      let characterSelection = await resolveCharacterSelectionSnapshot({
        client: prisma,
        stored: storedSelection,
        userId,
      });
      if (!characterSelection) {
        characterSelection = { source: 'dynamic', status: 'processing', imageUrl: null } as any;
      }
      const storedLanguages = normalizeLanguageList((settingsRecord as any)?.targetLanguages ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
      const storedLanguageVoices = normalizeLanguageVoiceMap((settingsRecord as any)?.languageVoicePreferences ?? null);
      // Build initial settings DTO; if missing, synthesize defaults without writing
      const schedulerPrefs = ensureSchedulerPreferences((settingsRecord as any)?.schedulerDefaultTimes, (settingsRecord as any)?.schedulerCadence);
      initialSettings = {
        ...makeDefaultSettings(sidebarOpen),
        includeDefaultMusic: settingsRecord?.includeDefaultMusic ?? true,
        addOverlay: settingsRecord?.addOverlay ?? true,
        includeCallToAction: (settingsRecord as any)?.includeCallToAction ?? true,
        autoApproveScript: settingsRecord?.autoApproveScript ?? true,
        autoApproveAudio: settingsRecord?.autoApproveAudio ?? true,
        watermarkEnabled: (settingsRecord as any)?.watermarkEnabled ?? true,
        captionsEnabled: (settingsRecord as any)?.captionsEnabled ?? true,
        defaultDurationSeconds: settingsRecord?.defaultDurationSec ?? null,
        defaultUseScript: (settingsRecord as any)?.defaultUseScript ?? false,
        targetLanguages: storedLanguages,
        languageVoicePreferences: storedLanguageVoices,
        scriptCreationGuidanceEnabled: (settingsRecord as any)?.scriptCreationGuidanceEnabled ?? false,
        scriptCreationGuidance: (settingsRecord as any)?.scriptCreationGuidance ?? '',
        scriptAvoidanceGuidanceEnabled: (settingsRecord as any)?.scriptAvoidanceGuidanceEnabled ?? false,
        scriptAvoidanceGuidance: (settingsRecord as any)?.scriptAvoidanceGuidance ?? '',
        audioStyleGuidanceEnabled: (settingsRecord as any)?.audioStyleGuidanceEnabled ?? false,
        audioStyleGuidance: (settingsRecord as any)?.audioStyleGuidance ?? '',
        characterSelection,
        preferredVoiceId: (settingsRecord as any)?.preferredVoiceId ?? defaultVoiceId,
        preferredTemplateId: (settingsRecord as any)?.preferredTemplateId ?? null,
        schedulerDefaultTimes: schedulerPrefs.times,
        schedulerCadence: schedulerPrefs.cadence,
      } as any;
      initialTokens = {
        balance: userRecord?.tokenBalance ?? 0,
        perSecondProject: TOKEN_COSTS.perSecondProject,
        minimumProjectTokens: MINIMUM_PROJECT_TOKENS,
        minimumProjectSeconds: TOKEN_COSTS.minimumProjectSeconds,
        actionCosts: TOKEN_COSTS.actions,
        signUpBonus: TOKEN_COSTS.signUpBonus,
      };
    } catch {
      // Surface "unknown" state so the client fetches the real data post-hydration
      initialSidebarOpen = false;
      initialSettings = null;
      initialTokens = null;
      initialAppLanguage = DEFAULT_APP_LANGUAGE;
    }
  } else if (!skipInitialData) {
    // Unauthenticated: provide defaults server-side to avoid client fetch churn
    initialSettings = { ...makeDefaultSettings(false), defaultUseScript: false } as any;
    initialTokens = null;
    initialAppLanguage = DEFAULT_APP_LANGUAGE;
  } else {
    // Skipped initial data entirely (build/placeholder env) – let the client load everything
    initialSidebarOpen = false;
    initialSettings = null;
    initialTokens = null;
    initialAppLanguage = DEFAULT_APP_LANGUAGE;
  }
  return (
    <html lang="en">
      <head>
        <StructuredData />

        <Script id="yandex-metrika" strategy="afterInteractive">
          {`
    (function(m,e,t,r,i,k,a){
      m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)}
      m[i].l=1*new Date()
      for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return } }
      k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=106798597', 'ym')

    ym(106798597, 'init', {
      ssr: true,
      webvisor: true,
      clickmap: true,
      ecommerce: 'dataLayer',
      referrer: document.referrer,
      url: location.href,
      accurateTrackBounce: true,
      trackLinks: true
    })
  `}
        </Script>

        <noscript>
          <div>
            <img
                src="https://mc.yandex.ru/watch/106798597"
                style={{ position: 'absolute', left: '-9999px' }}
                alt=""
            />
          </div>
        </noscript>

      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen overflow-hidden` }>
        <UtmSourceTracker />
        <SessionProviders session={session}>
          <AppLanguageProvider initialLanguage={initialAppLanguage} allowStoredOverride={!session?.user}>
            <Suspense fallback={null}>
              <AppLanguageQuerySync />
            </Suspense>
            <TokenProvider initial={initialTokens}>
              <SettingsProvider initial={initialSettings}>
                <ProjectsProvider>
                <div className="h-full flex flex-col">
                  <AppHeader />
                  <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Hide persistent sidebar on small screens */}
                    <div className="hidden md:block">
                      <Sidebar initialOpen={initialSidebarOpen} />
                    </div>
                    <main className="flex-1 p-4 sm:p-6 overflow-x-hidden overflow-y-auto min-h-0">
                      {children}
                    </main>
                  </div>
                </div>
                <AuthGate />
                {/* Global toast notifications */}
                <Toaster richColors />
                </ProjectsProvider>
              </SettingsProvider>
            </TokenProvider>
          </AppLanguageProvider>
        </SessionProviders>
      </body>
    </html>
  );
}
