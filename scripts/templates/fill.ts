#!/usr/bin/env tsx
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import type { CustomTemplateCustomData } from '@/shared/templates/custom-data';

const prisma = new PrismaClient();

const daemonEnvPath = path.resolve(process.cwd(), '.daemon.env');
if (fs.existsSync(daemonEnvPath)) {
  loadEnv({ path: daemonEnvPath, override: false });
}

function resolveWorkspacePath(envValue: string | undefined, envName: string) {
  const trimmed = envValue?.trim();
  if (!trimmed) {
    throw new Error(`Missing ${envName} environment variable. Update .daemon.env to include ${envName}.`);
  }
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
  try {
    const stats = fs.statSync(resolved);
    if (!stats.isDirectory()) {
      throw new Error(`${envName} path ${resolved} is not a directory. Update .daemon.env to point to a valid workspace.`);
    }
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      throw new Error(`${envName} directory not found at ${resolved}. Ensure the workspace exists and .daemon.env is up to date.`);
    }
    throw err;
  }
  return resolved;
}

function resolvePromptFile(baseDir: string, relativePath: string, label: string) {
  const fullPath = path.resolve(baseDir, relativePath);
  try {
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      throw new Error(`${label} prompt expected at ${fullPath}, but it is not a file.`);
    }
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      throw new Error(`${label} prompt not found at ${fullPath}. Ensure the workspace is synced.`);
    }
    throw err;
  }
  return fullPath;
}

const scriptWorkspaceV2 = resolveWorkspacePath(process.env.DAEMON_SCRIPT_WORKSPACE_V2, 'DAEMON_SCRIPT_WORKSPACE_V2');
const creepyFacesPromptPath = resolvePromptFile(
  scriptWorkspaceV2,
  'scripts/qwen-edit-cli/prompt/image-style/creepy-faces.txt',
  'Creepy Faces art style'
);
const simpsonsPromptPath = resolvePromptFile(
  scriptWorkspaceV2,
  'scripts/qwen-edit-cli/prompt/image-style/simpsons.txt',
  'Simpsons art style'
);
const bubbleGumPromptPath = resolvePromptFile(
  scriptWorkspaceV2,
  'scripts/qwen-edit-cli/prompt/image-style/bubblegum-pop-art.txt',
  'Bubble Gum art style'
);
const cyberpunkPromptPath = resolvePromptFile(
  scriptWorkspaceV2,
  'scripts/qwen-edit-cli/prompt/image-style/cyberpunk.txt',
  'Cyberpunk art style'
);
const plasticToysPromptPath = resolvePromptFile(
  scriptWorkspaceV2,
  'scripts/qwen-edit-cli/prompt/image-style/plastic-toy-shelf.txt',
  'Plastic Toys art style'
);
const ww1PromptPath = resolvePromptFile(
  scriptWorkspaceV2,
  'scripts/qwen-edit-cli/prompt/image-style/worldwide-war-1.txt',
  'WW1 art style'
);
const eightBitPromptPath = resolvePromptFile(
  scriptWorkspaceV2,
  'scripts/qwen-edit-cli/prompt/image-style/retro-8-bit.txt',
  '8 Bit art style'
);
const roboticPromptPath = resolvePromptFile(
  scriptWorkspaceV2,
  'scripts/qwen-edit-cli/prompt/image-style/robot-factory.txt',
  'Robotic art style'
);
const animePromptPath = resolvePromptFile(
  scriptWorkspaceV2,
  'scripts/qwen-edit-cli/prompt/image-style/anime.txt',
  'Anime art style'
);
const threeDPromptPath = resolvePromptFile(
  scriptWorkspaceV2,
  'scripts/qwen-edit-cli/prompt/image-style/stylized-3d-soft.txt',
  '3D art style'
);
const spongeBobPromptPath = resolvePromptFile(
  scriptWorkspaceV2,
  'scripts/qwen-edit-cli/prompt/image-style/sponge-bob.txt',
  'SpongeBob art style'
);
const halloweenPromptPath = resolvePromptFile(
  scriptWorkspaceV2,
  'scripts/qwen-edit-cli/prompt/image-style/halloween.txt',
  'Halloween art style'
);
const horrorPromptPath = resolvePromptFile(
  scriptWorkspaceV2,
  'scripts/qwen-edit-cli/prompt/image-style/very-scary.txt',
  'Horror art style'
);

const ART_STYLE_PROMPT_PATH = {
  basicCartoon: path.resolve(process.cwd(), 'content/prompts/basic-cartoon-style.txt'),
  neoNoir: path.resolve(process.cwd(), 'content/prompts/neo-noir-style.txt'),
  creepyFaces: creepyFacesPromptPath,
  simpsons: simpsonsPromptPath,
  bubbleGum: bubbleGumPromptPath,
  cyberpunk: cyberpunkPromptPath,
  plasticToys: plasticToysPromptPath,
  ww1: ww1PromptPath,
  eightBit: eightBitPromptPath,
  robotic: roboticPromptPath,
  anime: animePromptPath,
  threeD: threeDPromptPath,
  spongeBob: spongeBobPromptPath,
  halloween: halloweenPromptPath,
  horror: horrorPromptPath,
} as const;
const CAPTION_PRESETS = [
  { key: 'acid', title: 'Acid', description: 'High-energy neon pop preset.' },
  { key: 'halloween', title: 'Halloween', description: 'Spooky orange glow preset.' },
  { key: 'neondrift', title: 'Neon Drift', description: 'Retro synthwave captions preset.' },
  { key: 'oceanwhisper', title: 'Ocean Whisper', description: 'Cool aqua nautical preset.' },
  { key: 'bubblepop', title: 'Bubble Pop', description: 'Playful bubblegum caption preset.' },
  { key: 'bloody', title: 'Bloody', description: 'Horror-inspired crimson preset.' },
  { key: 'monoblock', title: 'Mono Block', description: 'Bold monochrome block preset.' },
  { key: 'cyberwave', title: 'Cyber Wave', description: 'Futuristic cyber caption preset.' },
  { key: 'goldstandard', title: 'Gold Standard', description: 'Premium gold-accent caption preset.' },
] as const;
const VOICE_LANGUAGES: Record<string, string> = {
  brittney: 'cs-CZ,de-DE,en-US,es-ES,hi-IN,hr-HR,hu-HU,it-IT,ko-KR,pl-PL,pt-PT,ro-RO,ru-RU,sv-SE',
  hope_podcaster: 'en-US,fil-PH,fr-FR,hr-HR,hu-HU,ko-KR,nl-NL,pt-PT,ro-RO,sk-SK,ta-IN,uk-UA',
  nayva: 'en-US,hi-IN,hr-HR,hu-HU,nl-NL,ro-RO,ru-RU,sk-SK,ta-IN',
  hope: 'bg-BG,cs-CZ,el-GR,en-US,es-ES,fr-FR,hi-IN,hr-HR,it-IT,ko-KR,pl-PL,pt-BR,pt-PT,ro-RO,sk-SK,tr-TR',
  hope_flirty: 'cs-CZ,da-DK,en-US,es-CO,fi-FI,fr-FR,hi-IN,hr-HR,it-IT,ms-MY,nl-NL,pt-BR,pt-PT,ro-RO,ru-RU,sk-SK,sv-SE,tr-TR',
  serafina: 'el-GR,en-US,fil-PH,fr-FR,hi-IN,hr-HR,hu-HU,pt-BR,ro-RO,sv-SE,ta-IN',
  finn: 'ar-SA,el-GR,en-US,es-ES,fil-PH,fr-FR,hi-IN,hr-HR,pt-BR,pt-PT,ru-RU',
  alex: 'en-US,fil-PH,hi-IN,hu-HU,it-IT,pt-BR,ru-RU,sk-SK,ta-IN,tr-TR,uk-UA',
  mark: 'ar-SA,cs-CZ,da-DK,de-DE,en-US,es-ES,fil-PH,fr-FR,hi-IN,hr-HR,hu-HU,it-IT,ko-KR,no-NO,pl-PL,pt-BR,pt-PT,ro-RO,sk-SK,sv-SE,ta-IN,tr-TR,uk-UA',
  peter: 'da-DK,de-DE,el-GR,en-US,fr-FR,hr-HR,hu-HU,it-IT,nl-NL,pt-PT,ro-RO,sk-SK,sv-SE,ta-IN,tr-TR',
};
const MINIMAX_LANGUAGE_MAP = {
  english: { codes: ['en', 'en-US', 'en-GB'], dir: 'english' },
  chinese: { codes: ['zh', 'zh-CN'], dir: 'chinese' },
  cantonese: { codes: ['yue', 'zh-HK'], dir: 'cantonese' },
  japanese: { codes: ['ja', 'ja-JP'], dir: 'japanese' },
  korean: { codes: ['ko', 'ko-KR'], dir: 'korean' },
  spanish: { codes: ['es', 'es-ES', 'es-MX'], dir: 'spanish' },
  portuguese: { codes: ['pt', 'pt-PT', 'pt-BR'], dir: 'portuguese' },
  french: { codes: ['fr', 'fr-FR', 'fr-CA'], dir: 'french' },
  german: { codes: ['de', 'de-DE'], dir: 'german' },
  italian: { codes: ['it', 'it-IT'], dir: 'italian' },
  russian: { codes: ['ru', 'ru-RU'], dir: 'russian' },
  turkish: { codes: ['tr', 'tr-TR'], dir: 'turkish' },
  arabic: { codes: ['ar', 'ar-SA'], dir: 'arabic' },
  ukrainian: { codes: ['uk', 'uk-UA'], dir: 'ukrainian' },
  vietnamese: { codes: ['vi', 'vi-VN'], dir: 'vietnamese' },
  thai: { codes: ['th', 'th-TH'], dir: 'thai' },
  polish: { codes: ['pl', 'pl-PL'], dir: 'polish' },
  romanian: { codes: ['ro', 'ro-RO'], dir: 'romanian' },
  greek: { codes: ['el', 'el-GR'], dir: 'greek' },
  dutch: { codes: ['nl', 'nl-NL'], dir: 'dutch' },
  finnish: { codes: ['fi', 'fi-FI'], dir: 'finnish' },
  czech: { codes: ['cs', 'cs-CZ'], dir: 'czech' },
  hindi: { codes: ['hi', 'hi-IN'], dir: 'hindi' },
  indonesian: { codes: ['id', 'id-ID'], dir: 'indonesian' },
} as const;
type MinimaxLanguageKey = keyof typeof MINIMAX_LANGUAGE_MAP;

const INWORLD_VOICES_PATH = path.resolve(scriptWorkspaceV2, 'scripts/audio-inworld/voices.json');
const SUPPORTED_APP_LANGUAGES = ['en', 'ru', 'es', 'fr', 'de', 'pt', 'it'] as const;
type SupportedAppLanguage = (typeof SUPPORTED_APP_LANGUAGES)[number];
const SUPPORTED_APP_LANGUAGE_SET = new Set<SupportedAppLanguage>(SUPPORTED_APP_LANGUAGES);
const INWORLD_LANGUAGE_MAP: Record<SupportedAppLanguage, { codes: string[]; dir: string }> = {
  en: { codes: ['en', 'en-US', 'en-GB'], dir: 'english' },
  ru: { codes: ['ru', 'ru-RU'], dir: 'russian' },
  es: { codes: ['es', 'es-ES', 'es-MX'], dir: 'spanish' },
  fr: { codes: ['fr', 'fr-FR'], dir: 'french' },
  de: { codes: ['de', 'de-DE'], dir: 'german' },
  pt: { codes: ['pt', 'pt-PT', 'pt-BR'], dir: 'portuguese' },
  it: { codes: ['it', 'it-IT'], dir: 'italian' },
};

type MinimaxVoiceDefinition = {
  id: string;
  name: string;
  description?: string;
  gender?: string;
};
type MinimaxVoiceFile = Partial<Record<string, MinimaxVoiceDefinition[]>>;

const MINIMAX_VOICES_PATH = path.resolve(scriptWorkspaceV2, 'scripts/audio-minimax/voices.json');

type ParsedMinimaxVoice = {
  languageKey: MinimaxLanguageKey;
  id: string;
  name: string;
  description?: string;
  gender?: string;
};

const SLOW_KEYWORDS = [
  'calm',
  'gentle',
  'serene',
  'soft',
  'relaxed',
  'laid-back',
  'warm',
  'soothing',
  'steady',
  'mature',
  'deep',
  'thoughtful',
  'sentimental',
  'slow',
  'quiet',
  'peaceful',
];

type ElevenLabsVoiceSeed = {
  alias: keyof typeof VOICE_LANGUAGES;
  title: string;
  description?: string;
  externalId: string;
  speed: 'fast' | 'slow';
  gender: 'female' | 'male';
  previewPath: string;
};

const ELEVENLABS_VOICE_SEEDS: ElevenLabsVoiceSeed[] = [
  { alias: 'brittney', title: 'Brittney', description: 'A young vibrant female voice', externalId: 'kPzsL2i3teMYv0FxEYQ6', speed: 'fast', gender: 'female', previewPath: '/voices/kPzsL2i3teMYv0FxEYQ6.mp3' },
  { alias: 'hope_podcaster', title: 'Hope (Podcaster)', description: 'Podcast tone — warm, present mic sound', externalId: 'zGjIP4SZlMnY9m93k97r', speed: 'fast', gender: 'female', previewPath: '/voices/zGjIP4SZlMnY9m93k97r.mp3' },
  { alias: 'nayva', title: 'Nayva', description: 'Edgy voice for social media', externalId: 'h2dQOVyUfIDqY2whPOMo', speed: 'fast', gender: 'female', previewPath: '/voices/h2dQOVyUfIDqY2whPOMo.mp3' },
  { alias: 'hope', title: 'Hope', description: 'Woman — natural conversational voice', externalId: 'OYTbf65OHHFELVut7v2H', speed: 'slow', gender: 'female', previewPath: '/voices/OYTbf65OHHFELVut7v2H.mp3' },
  { alias: 'hope_flirty', title: 'Hope (Flirty)', description: 'Flirty and smooth', externalId: 'WAhoMTNdLdMoq1j3wf3I', speed: 'slow', gender: 'female', previewPath: '/voices/WAhoMTNdLdMoq1j3wf3I.mp3' },
  { alias: 'serafina', title: 'Serafina', description: 'Flirty voice', externalId: '4tRn1lSkEn13EVTuqb0g', speed: 'slow', gender: 'female', previewPath: '/voices/4tRn1lSkEn13EVTuqb0g.mp3' },
  { alias: 'finn', title: 'Finn', description: 'Well connected young conversational male voice', externalId: 'vBKc2FfBKJfcZNyEt1n6', speed: 'fast', gender: 'male', previewPath: '/voices/vBKc2FfBKJfcZNyEt1n6.mp3' },
  { alias: 'alex', title: 'Alex', description: 'An upbeat and pleasant man voice', externalId: 'yl2ZDV1MzN4HbQJbMihG', speed: 'fast', gender: 'male', previewPath: '/voices/yl2ZDV1MzN4HbQJbMihG.mp3' },
  { alias: 'mark', title: 'Mark', description: 'A casual, young adult speaking in a natural manner', externalId: 'UgBBYS2sOqTuMpoF3BR0', speed: 'fast', gender: 'male', previewPath: '/voices/UgBBYS2sOqTuMpoF3BR0.mp3' },
  { alias: 'peter', title: 'Peter', description: 'Man — confident, reliable, credible narrator', externalId: 'ZthjuvLPty3kTMaNKVKb', speed: 'slow', gender: 'male', previewPath: '/voices/ZthjuvLPty3kTMaNKVKb.mp3' },
];

function loadMinimaxVoiceSeeds(): ParsedMinimaxVoice[] {
  let raw: string;
  try {
    raw = fs.readFileSync(MINIMAX_VOICES_PATH, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read MiniMax voices JSON at ${MINIMAX_VOICES_PATH}: ${(err as Error).message}`);
  }
  let payload: MinimaxVoiceFile;
  try {
    payload = JSON.parse(raw) as MinimaxVoiceFile;
  } catch (err) {
    throw new Error(`Failed to parse MiniMax voices JSON: ${(err as Error).message}`);
  }
  const parsed: ParsedMinimaxVoice[] = [];
  for (const [rawKey, entries] of Object.entries(payload)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const normalizedKey = rawKey.trim().toLowerCase() as MinimaxLanguageKey;
    if (!MINIMAX_LANGUAGE_MAP[normalizedKey]) {
      throw new Error(`MiniMax voices JSON references unsupported language "${rawKey}". Update MINIMAX_LANGUAGE_MAP.`);
    }
    for (const entry of entries) {
      const id = entry.id?.trim();
      if (!id) continue;
      const name = entry.name?.trim() || id;
      parsed.push({
        languageKey: normalizedKey,
        id,
        name,
        description: entry.description?.trim() || undefined,
        gender: entry.gender?.trim() || undefined,
      });
    }
  }
  if (parsed.length === 0) {
    throw new Error('MiniMax voices JSON does not contain any usable voices.');
  }
  return parsed;
}

type InworldVoiceEntry = {
  id?: string;
  name?: string;
  description?: string;
};

type InworldVoicesFile = {
  generatedAt?: string;
  languages?: string[];
  voices?: Record<string, InworldVoiceEntry[]>;
};

type ParsedInworldVoice = {
  id: string;
  name: string;
  description: string | null;
  languages: SupportedAppLanguage[];
  primaryLanguage: SupportedAppLanguage;
};

function loadInworldVoiceSeeds(): ParsedInworldVoice[] {
  let raw: string;
  try {
    raw = fs.readFileSync(INWORLD_VOICES_PATH, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read Inworld voices JSON at ${INWORLD_VOICES_PATH}: ${(err as Error).message}`);
  }
  let payload: InworldVoicesFile;
  try {
    payload = JSON.parse(raw) as InworldVoicesFile;
  } catch (err) {
    throw new Error(`Failed to parse Inworld voices JSON: ${(err as Error).message}`);
  }
  const aggregated = new Map<
    string,
    {
      id: string;
      name: string;
      description: string | null;
      languages: Set<SupportedAppLanguage>;
      primaryLanguage: SupportedAppLanguage;
    }
  >();
  const entries = payload.voices ?? {};
  for (const [languageKey, voices] of Object.entries(entries)) {
    const normalized = languageKey.trim().toLowerCase();
    if (!SUPPORTED_APP_LANGUAGE_SET.has(normalized as SupportedAppLanguage)) continue;
    const normalizedLanguage = normalized as SupportedAppLanguage;
    if (!Array.isArray(voices) || voices.length === 0) continue;
    for (const voice of voices) {
      const id = voice.id?.trim();
      if (!id) continue;
      const name = voice.name?.trim() || id;
      const description = voice.description?.trim() || null;
      let record = aggregated.get(id);
      if (!record) {
        record = {
          id,
          name,
          description,
          languages: new Set<SupportedAppLanguage>(),
          primaryLanguage: normalizedLanguage,
        };
        aggregated.set(id, record);
      }
      if (!record.description && description) {
        record.description = description;
      }
      record.languages.add(normalizedLanguage);
      if (normalizedLanguage === 'en') {
        record.primaryLanguage = normalizedLanguage;
      }
    }
  }

  const parsed: ParsedInworldVoice[] = [];
  for (const item of aggregated.values()) {
    if (item.languages.size === 0) continue;
    parsed.push({
      id: item.id,
      name: item.name,
      description: item.description,
      languages: Array.from(item.languages),
      primaryLanguage: item.primaryLanguage,
    });
  }
  if (parsed.length === 0) {
    throw new Error('Inworld voices JSON does not contain any supported voices.');
  }
  return parsed;
}

function buildMinimaxPreviewPath(languageKey: MinimaxLanguageKey, voiceId: string): string {
  const dir = MINIMAX_LANGUAGE_MAP[languageKey].dir;
  return path.posix.join('/voices/minimax', dir, `${voiceId}.mp3`);
}

function inferVoiceSpeed(name: string, description?: string | null): 'fast' | 'slow' {
  const haystack = `${name || ''} ${description || ''}`.toLowerCase();
  return SLOW_KEYWORDS.some((keyword) => haystack.includes(keyword)) ? 'slow' : 'fast';
}

function normalizeGender(value: string | undefined): 'female' | 'male' | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('f')) return 'female';
  if (normalized.startsWith('m')) return 'male';
  return null;
}

function inferGenderFromDescription(text: string | null | undefined): 'female' | 'male' | null {
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (/\b(female|woman|girl|lady)\b/.test(normalized)) return 'female';
  if (/\b(male|man|boy|guy)\b/.test(normalized)) return 'male';
  return null;
}

function slugifyForPreview(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-') || 'voice';
}

function buildInworldPreviewPath(language: SupportedAppLanguage, voiceId: string): string {
  const dir = INWORLD_LANGUAGE_MAP[language].dir;
  return path.posix.join('/voices/inworld', dir, `${slugifyForPreview(voiceId)}.mp3`);
}

function parseVoiceLanguageCodes(languages: string | null | undefined): string[] {
  if (!languages) return [];
  return languages
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => value.replace(/_/g, '-'))
    .map((value) => value.split('-')[0] || '')
    .map((value) => value.toLowerCase())
    .filter((value) => value.length > 0);
}

function voiceSupportsLanguageCode(voice: SeededVoiceInfo, code: string): boolean {
  const parsed = parseVoiceLanguageCodes(voice.languages);
  if (!parsed.length) return code === 'en';
  return parsed.includes(code);
}

function computeVoiceWeight(params: {
  provider: VoiceProviderType;
  languageKey: MinimaxLanguageKey | SupportedAppLanguage | null;
  gender: 'female' | 'male' | null;
  speed: 'fast' | 'slow' | null;
}): number {
  const providerBase = params.provider === 'inworld' ? 2000 : params.provider === 'minimax' ? 1000 : 100;
  const languageBonus =
    (params.provider === 'minimax' && params.languageKey === 'english') || (params.provider === 'inworld' && params.languageKey === 'en')
      ? 150
      : 0;
  const genderBonus = params.gender === 'female' ? 25 : 0;
  const speedBonus = params.speed === 'fast' ? 10 : 0;
  return providerBase + languageBonus + genderBonus + speedBonus;
}

type VoiceProviderType = 'minimax' | 'elevenlabs' | 'inworld';

type SeededVoiceInfo = {
  id: string;
  externalId: string;
  languageKey: MinimaxLanguageKey | SupportedAppLanguage | null;
  gender: 'female' | 'male' | null;
  speed: 'fast' | 'slow' | null;
  voiceProvider: VoiceProviderType | null;
  weight: number;
  languages: string | null;
};
async function ensureAdmin(): Promise<{ id: string }> {
  const admin = await prisma.user.findFirst({ where: { isAdmin: true }, select: { id: true } });
  if (admin) return admin;
  const created = await prisma.user.create({
    data: { email: `admin.templates+${Date.now()}@local.dev`, name: 'Templates Admin', isAdmin: true },
    select: { id: true },
  });
  return created;
}

async function ensureOverlay() {
  const TemplateOverlay: any = (prisma as any).templateOverlay;
  const overlayData = {
    title: 'Sparkles',
    url: 'content/overlay/sparkles-9_16-20s-transparent.webm',
    description: 'Animated sparkles overlay for vertical videos.',
  };
  const existing = await TemplateOverlay.findFirst({ where: { title: overlayData.title } });
  if (existing) {
    const updated = await TemplateOverlay.update({ where: { id: existing.id }, data: { ...overlayData, isPublic: true } });
    console.log('Created/updated overlay:', updated.title);
    return updated;
  }
  const created = await TemplateOverlay.create({ data: { ...overlayData, isPublic: true } });
  console.log('Created/updated overlay:', created.title);
  return created;
}

async function ensureMusic(ownerId: string) {
  const TemplateMusic: any = (prisma as any).templateMusic;
  const musicData = {
    ownerId,
    title: 'Backbeat Groove',
    url: 'content/music/my-2-back.wav',
    description: 'Default upbeat background music for YumCut shorts.',
  };
  const existing = await TemplateMusic.findFirst({ where: { url: musicData.url } });
  if (existing) {
    const updated = await TemplateMusic.update({ where: { id: existing.id }, data: { ...musicData, isPublic: true } });
    console.log('Created/updated music:', updated.title);
    return updated;
  }
  const created = await TemplateMusic.create({ data: { ...musicData, isPublic: true } });
  console.log('Created/updated music:', created.title);
  return created;
}

async function ensureArtStyles(ownerId: string) {
  const TemplateArtStyle: any = (prisma as any).templateArtStyle;
  const configs = [
    {
      title: 'Basic Cartoon',
      description: 'Clean dual-panel comic illustration style seeded from basic-cartoon-style prompt.',
      pathKey: 'basicCartoon' as const,
    },
    {
      title: 'Neo-Noir',
      description: 'Monochrome neo-noir comic aesthetic with extreme chiaroscuro and gritty ink textures.',
      pathKey: 'neoNoir' as const,
    },
    {
      title: 'Creepy Faces',
      description: 'Hyper-stylized horror portraits with exaggerated facial expressions, deep shadows, and unsettling lighting.',
      pathKey: 'creepyFaces' as const,
    },
    {
      title: 'Yellow',
      description: 'Bold cel shading with exaggerated cartoon proportions and a signature bright yellow palette inspired by classic flat animation.',
      pathKey: 'simpsons' as const,
    },
    {
      title: 'Bubble Gum',
      description: 'Glossy bubble gum pop art portraits with playful gradients and high-energy palettes.',
      pathKey: 'bubbleGum' as const,
    },
    {
      title: 'Plastic Toys',
      description: 'Whimsical plastic toy portraits with glossy surfaces and colorful shelf lighting.',
      pathKey: 'plasticToys' as const,
    },
    {
      title: 'Robotic',
      description: 'Futuristic robotic portraits with metallic plating, glowing circuitry, and factory haze.',
      pathKey: 'robotic' as const,
    },
    {
      title: 'WW1',
      description: 'Weathered World War I illustrations with sepia grit, trench gear, and battlefield haze.',
      pathKey: 'ww1' as const,
    },
    {
      title: '8 Bit',
      description: 'Retro 8-bit pixel art portraits with vibrant palettes and chunky dithering.',
      pathKey: 'eightBit' as const,
    },
    {
      title: 'Cyberpunk',
      description: 'Electric neon cyberpunk portraits with high-contrast lighting and futuristic city flair.',
      pathKey: 'cyberpunk' as const,
    },
    {
      title: 'Anime',
      description: 'Stylised anime illustration prompt with dramatic shading and expressive eyes.',
      pathKey: 'anime' as const,
    },
    {
      title: '3D',
      description: 'Stylised soft 3D render with cinematic lighting and depth.',
      pathKey: 'threeD' as const,
    },
    {
      title: 'Undersea Cartoon',
      description: 'Bold cel-shaded undersea cartoon style with bubbly outlines and high-saturation palettes.',
      pathKey: 'spongeBob' as const,
    },
    {
      title: 'Halloween',
      description: 'Moody orange-and-purple Halloween illustrations with spooky lighting.',
      pathKey: 'halloween' as const,
    },
    {
      title: 'Horror',
      description: 'Intense horror imagery with very scary, high-contrast lighting and atmosphere.',
      pathKey: 'horror' as const,
    },
  ];

  const result = {} as Record<keyof typeof ART_STYLE_PROMPT_PATH, { id: string }>;
  for (const cfg of configs) {
    let prompt: string;
    const promptPath = ART_STYLE_PROMPT_PATH[cfg.pathKey];
    try {
      prompt = fs.readFileSync(promptPath, 'utf8');
    } catch (err) {
      throw new Error(`Failed to read art style prompt from ${promptPath}: ${(err as Error).message}`);
    }
    const data = {
      ownerId,
      title: cfg.title,
      description: cfg.description,
      prompt,
      referenceImageUrl: null,
      isPublic: true,
    };
    const existing = await TemplateArtStyle.findFirst({ where: { title: data.title } });
    let record;
    if (existing) {
      record = await TemplateArtStyle.update({ where: { id: existing.id }, data });
    } else {
      record = await TemplateArtStyle.create({ data });
    }
    console.log('Created/updated art style:', record.title);
    result[cfg.pathKey] = { id: record.id as string };
  }
  return result;
}

async function ensureCaptionsStyles() {
  const TemplateCaptionsStyle: any = (prisma as any).templateCaptionsStyle;
  const result: Record<string, { id: string }> = {};
  for (const preset of CAPTION_PRESETS) {
    const data = {
      title: preset.title,
      description: preset.description,
      externalId: preset.key,
      isPublic: true,
    };
    const existing = await TemplateCaptionsStyle.findFirst({ where: { externalId: preset.key } });
    let record;
    if (existing) {
      record = await TemplateCaptionsStyle.update({ where: { id: existing.id }, data });
    } else {
      record = await TemplateCaptionsStyle.create({ data });
    }
    console.log('Created/updated captions style:', record.title);
    result[preset.key] = { id: record.id as string };
  }
  return result;
}

async function ensureVoices(): Promise<SeededVoiceInfo[]> {
  const TemplateVoice: any = (prisma as any).templateVoice;
  const minimaxSeeds = loadMinimaxVoiceSeeds().map((voice) => {
    const gender = normalizeGender(voice.gender);
    const speed = inferVoiceSpeed(voice.name, voice.description);
    const weight = computeVoiceWeight({
      provider: 'minimax',
      languageKey: voice.languageKey,
      gender,
      speed,
    });
    return {
      alias: voice.id,
      title: voice.name,
      description: voice.description ?? null,
      externalId: voice.id,
      speed,
      gender,
      previewPath: buildMinimaxPreviewPath(voice.languageKey, voice.id),
      languages: MINIMAX_LANGUAGE_MAP[voice.languageKey].codes.join(','),
      voiceProvider: 'minimax' as const,
      languageKey: voice.languageKey,
      weight,
    };
  });

  const elevenSeeds = ELEVENLABS_VOICE_SEEDS.map((voice) => {
    const weight = computeVoiceWeight({
      provider: 'elevenlabs',
      languageKey: null,
      gender: voice.gender,
      speed: voice.speed,
    });
    return {
      alias: voice.alias,
      title: voice.title,
      description: voice.description ?? null,
      externalId: voice.externalId,
      speed: voice.speed,
      gender: voice.gender,
      previewPath: voice.previewPath,
      languages: VOICE_LANGUAGES[voice.alias] ?? 'en-US',
      voiceProvider: 'elevenlabs' as const,
      languageKey: null,
      weight,
    };
  });

  const inworldSeeds = loadInworldVoiceSeeds().map((voice) => {
    const gender = inferGenderFromDescription(voice.description);
    const speed = inferVoiceSpeed(voice.name, voice.description);
    const weight = computeVoiceWeight({
      provider: 'inworld',
      languageKey: voice.primaryLanguage,
      gender,
      speed,
    });
    const languageCodes = new Set<string>();
    for (const language of voice.languages) {
      const mapping = INWORLD_LANGUAGE_MAP[language];
      mapping.codes.forEach((code) => languageCodes.add(code));
    }
    const languages = languageCodes.size > 0 ? Array.from(languageCodes).join(',') : 'en';
    return {
      alias: voice.id,
      title: voice.name,
      description: voice.description,
      externalId: voice.id,
      speed,
      gender,
      previewPath: buildInworldPreviewPath(voice.primaryLanguage, voice.id),
      languages,
      voiceProvider: 'inworld' as const,
      languageKey: voice.primaryLanguage,
      weight,
    };
  });

  // Process lower-priority providers first so higher-priority seeds can overwrite duplicate externalIds.
  const seeds = [...elevenSeeds, ...minimaxSeeds, ...inworldSeeds];
  const result: SeededVoiceInfo[] = [];
  for (const voice of seeds) {
    const data = {
      title: voice.title,
      description: voice.description,
      externalId: voice.externalId,
      speed: voice.speed,
      gender: voice.gender,
      previewPath: voice.previewPath,
      languages: voice.languages ?? null,
      voiceProvider: voice.voiceProvider,
      weight: voice.weight,
      isPublic: true,
    };
    const existing = await TemplateVoice.findFirst({ where: { externalId: voice.externalId } });
    let record;
    if (existing) {
      record = await TemplateVoice.update({ where: { id: existing.id }, data });
    } else {
      record = await TemplateVoice.create({ data });
    }
    console.log('Created/updated voice:', voice.title);
    result.push({
      id: record.id as string,
      externalId: record.externalId as string,
      languageKey: voice.languageKey,
      gender: voice.gender,
      speed: voice.speed,
      voiceProvider: voice.voiceProvider,
      weight: voice.weight,
      languages: voice.languages ?? null,
    });
  }

  return result;
}

async function main() {
  const admin = await ensureAdmin();
  const sparklesOverlay = await ensureOverlay();
  const defaultMusic = await ensureMusic(admin.id);
  const artStyles = await ensureArtStyles(admin.id);
  // Preview assets are generated with `npm run tools:convert-preview -- --source <input> --target-image <preview.jpg> --target-video <preview.mp4>`.
  // Keep previews up to date when adding or updating template art styles.
  const basicCartoonArtStyle = artStyles.basicCartoon;
  const neoNoirArtStyle = artStyles.neoNoir;
  const creepyFacesArtStyle = artStyles.creepyFaces;
  const simpsonsArtStyle = artStyles.simpsons;
  const bubbleGumArtStyle = artStyles.bubbleGum;
  const plasticToysArtStyle = artStyles.plasticToys;
  const roboticArtStyle = artStyles.robotic;
  const ww1ArtStyle = artStyles.ww1;
  const eightBitArtStyle = artStyles.eightBit;
  const cyberpunkArtStyle = artStyles.cyberpunk;
  const animeArtStyle = artStyles.anime;
  const threeDArtStyle = artStyles.threeD;
  const spongeBobArtStyle = artStyles.spongeBob;
  const halloweenArtStyle = artStyles.halloween;
  const horrorArtStyle = artStyles.horror;
  const captionStyles = await ensureCaptionsStyles();
  const seededVoices = await ensureVoices();
  const providerPriority: VoiceProviderType[] = ['inworld', 'minimax'];
  const findPreferredVoice = (predicate: (voice: SeededVoiceInfo) => boolean): string | null => {
    for (const provider of providerPriority) {
      const match = seededVoices.find((voice) => voice.voiceProvider === provider && predicate(voice));
      if (match) return match.id;
    }
    const fallback = seededVoices.find(predicate);
    return fallback?.id ?? null;
  };

  const fastFemaleVoiceId =
    findPreferredVoice((voice) => voiceSupportsLanguageCode(voice, 'en') && voice.gender === 'female' && voice.speed === 'fast') ??
    findPreferredVoice((voice) => voiceSupportsLanguageCode(voice, 'en') && voice.gender === 'female') ??
    findPreferredVoice((voice) => voice.gender === 'female' && voice.speed === 'fast') ??
    findPreferredVoice((voice) => voice.gender === 'female') ??
    seededVoices.find((voice) => voice.gender === 'female' && voice.speed === 'fast')?.id ??
    seededVoices.find((voice) => voice.gender === 'female')?.id ??
    seededVoices[0]?.id ??
    null;

  // When yumcut-shorts-tools v2 runs, it picks an effects JSON whose filename matches the template code.
  // If a template-specific JSON does not exist, copy `basic.json` to `<code>.json` so the runtime can fall back gracefully.
  type TemplateSeedCustomData = Omit<CustomTemplateCustomData, 'raw'>;
  const v2ComicsCustomData: TemplateSeedCustomData = {
    type: 'custom',
    customId: 'comics',
    supportsCustomCharacters: false,
    supportsExactText: true,
    supportsScriptPrompt: false,
  };
  const v2CrimeSlavicCustomData: TemplateSeedCustomData = {
    type: 'custom',
    customId: 'crime-slavic',
    supportsCustomCharacters: false,
    supportsExactText: true,
    supportsScriptPrompt: false,
  };

  const templates = [
    {
      code: 'basic',
      title: 'Basic Effects',
      description: 'Classic pans, zooms, and simple overlays to give stories a clean, polished lift.',
      previewImageUrl: '/template/basic/preview.jpg',
      previewVideoUrl: '/template/basic/preview.mp4',
      textPrompt: 'Produce a concise narrative that leans on simple camera moves, basic overlays, and clear pacing to keep attention focused on the core message.',
      weight: 120,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: basicCartoonArtStyle?.id,
      captionsStyleId: captionStyles.halloween?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'doodling',
      title: 'Doodling',
      description: 'Playful hand-drawn transitions with sketchbook energy for lighthearted stories.',
      previewImageUrl: '/template/doodling/preview.jpg',
      previewVideoUrl: '/template/doodling/preview.mp4',
      textPrompt: 'Create a whimsical vertical video that feels like a living sketchbook. Use hand-drawn illustrations, stop-motion doodle animations, and upbeat pacing to match the playful tone.',
      weight: 70,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: basicCartoonArtStyle?.id,
      captionsStyleId: captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'neo_noir',
      title: 'Neo-Noir',
      description: 'Ink-drenched noir panels with extreme contrast and cinematic tension.',
      previewImageUrl: '/template/noir/preview.jpg',
      previewVideoUrl: '/template/noir/preview.mp4',
      textPrompt: 'Craft a moody neo-noir vertical video using stark black-and-white imagery, dramatic lighting, and gritty textures that sync with the story.',
      weight: 100,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: neoNoirArtStyle?.id,
      captionsStyleId: captionStyles.monoblock?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'v2-comics',
      title: 'Comics',
      description: 'High-quality comic story edit packed with dramatic multi-panel pacing and bold inks.',
      previewImageUrl: '/template/v2-comics/preview.jpg',
      previewVideoUrl: '/template/v2-comics/preview.mp4',
      textPrompt: 'Produce a premium comic-book style story with crisp inks, halftone textures, and thoughtful pacing that feels like sequential art coming to life.',
      weight: 150,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: basicCartoonArtStyle?.id,
      captionsStyleId: captionStyles.monoblock?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
      customData: v2ComicsCustomData,
    },
    {
      code: 'v2-crime-slavic',
      title: 'Crime Slavic',
      description: 'Cold-war crime thriller pacing with smoke-filled safe houses, stern agents, and glowing terminals.',
      previewImageUrl: '/template/v2-crime-slavic/preview.jpg',
      previewVideoUrl: '/template/v2-crime-slavic/preview.mp4',
      textPrompt:
        'Craft a tense Slavic crime thriller short set in smoke-filled command bunkers. Highlight suited operatives, analog control rooms, ominous glowing terminals, and gritty industrial lighting with deliberate pacing.',
      weight: 149,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: neoNoirArtStyle?.id,
      captionsStyleId: captionStyles.monoblock?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
      customData: v2CrimeSlavicCustomData,
    },
    {
      code: 'creepy_faces',
      title: 'Creepy Faces',
      description: 'Basic effects sequence where every face is modified to look extra scary, layering horror-grade grading over familiar moves.',
      previewImageUrl: '/template/creepy-faces/preview.jpg',
      previewVideoUrl: '/template/creepy-faces/preview.mp4',
      textPrompt: 'Generate a vertical short using the same basic camera pans, zooms, and overlays as the Basic Effects template while modifying character faces to look noticeably scarier with unsettling lighting and grading.',
      weight: 98,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: creepyFacesArtStyle?.id,
      captionsStyleId: captionStyles.bloody?.id ?? captionStyles.halloween?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'simpsons',
      title: 'Yellow',
      description: 'Basic effects sequence with faces restyled in bright yellow cel shading and thick outlines.',
      previewImageUrl: '/template/simpsons/preview.jpg',
      previewVideoUrl: '/template/simpsons/preview.mp4',
      textPrompt: 'Generate a vertical short using the basic effects toolkit while turning characters into Simpsons-style figures with bright colors and comedic expressions.',
      weight: 97,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: simpsonsArtStyle?.id,
      captionsStyleId: captionStyles.bubblepop?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'cyberpunk',
      title: 'Cyberpunk',
      description: 'High-octane edits drenched in neon cyberpunk palettes with futuristic city energy.',
      previewImageUrl: '/template/cyberpunk/preview.jpg',
      previewVideoUrl: '/template/cyberpunk/preview.mp4',
      textPrompt: 'Generate a vertical short using the basic effects toolkit while infusing every frame with neon-lit cyberpunk city ambience, holographic interfaces, and dynamic tech-inspired motion.',
      weight: 96,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: cyberpunkArtStyle?.id,
      captionsStyleId: captionStyles.cyberwave?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'bubble_gum',
      title: 'Bubble Gum',
      description: 'Playful edits with sugary bubble gum pop art vibes and bold, glossy visuals.',
      previewImageUrl: '/template/bubble-gum/preview.jpg',
      previewVideoUrl: '/template/bubble-gum/preview.mp4',
      textPrompt: 'Generate a vertical short using the basic effects toolkit while coating each frame in bubble gum pop art colors, glossy highlights, and playful motion cues.',
      weight: 94,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: bubbleGumArtStyle?.id,
      captionsStyleId: captionStyles.bubblepop?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'plastic_toys',
      title: 'Plastic Toys',
      description: 'Playful edits where every character becomes a glossy collectible toy on a vibrant shelf.',
      previewImageUrl: '/template/plastic-toys/preview.jpg',
      previewVideoUrl: '/template/plastic-toys/preview.mp4',
      textPrompt: 'Generate a vertical short using the basic effects toolkit while transforming each scene into a plastic toy shelf with glossy surfaces, bright packaging colors, and cheerful lighting.',
      weight: 92,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: plasticToysArtStyle?.id,
      captionsStyleId: captionStyles.bubblepop?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'robotic',
      title: 'Robotic',
      description: 'Electrifying edits that render every subject as a chrome-plated robot with glowing circuitry.',
      previewImageUrl: '/template/robotic/preview.jpg',
      previewVideoUrl: '/template/robotic/preview.mp4',
      textPrompt: 'Generate a vertical short using the basic effects toolkit while transforming every scene into a robotics factory with chrome plating, illuminated wiring, and industrial atmospherics.',
      weight: 90,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: roboticArtStyle?.id,
      captionsStyleId: captionStyles.cyberwave?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'ww1',
      title: 'WW1',
      description: 'Dramatic edits drenched in sepia-toned World War I grit, trenches, and historical drama.',
      previewImageUrl: '/template/ww1/preview.jpg',
      previewVideoUrl: '/template/ww1/preview.mp4',
      textPrompt: 'Generate a vertical short using the basic effects toolkit while transforming each frame into a World War I battlefield vignette with sepia grit, trench warfare details, and archival energy.',
      weight: 88,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: ww1ArtStyle?.id,
      captionsStyleId: captionStyles.monoblock?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'eight_bit',
      title: '8 Bit',
      description: 'Playful edits stylised as retro 8-bit pixel art with arcade-era energy.',
      previewImageUrl: '/template/8-bit/preview.jpg',
      previewVideoUrl: '/template/8-bit/preview.mp4',
      textPrompt: 'Generate a vertical short using the basic effects toolkit while rendering every frame as retro 8-bit pixel art with arcade palettes, dithering, and nostalgic game UI details.',
      weight: 86,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: eightBitArtStyle?.id,
      captionsStyleId: captionStyles.neondrift?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'horror',
      title: 'Horror',
      description: 'Basic effects sequence dialed up with terrifying imagery, stark shadows, and unsettling atmosphere.',
      previewImageUrl: '/template/horror/preview.jpg',
      previewVideoUrl: '/template/horror/preview.mp4',
      textPrompt: 'Generate a vertical short using the basic effects toolkit while amping up the horror with high-contrast lighting, ominous textures, and jump-scare ready pacing.',
      weight: 96,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: horrorArtStyle?.id,
      captionsStyleId: captionStyles.bloody?.id ?? captionStyles.halloween?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'sponge_bob',
      title: 'Undersea Cartoon',
      description: 'Basic effects sequence splashed with undersea cartoon humor, saturated colors, and bubbly motion.',
      previewImageUrl: '/template/sponge-bob/preview.jpg',
      previewVideoUrl: '/template/sponge-bob/preview.mp4',
      textPrompt: 'Generate a vertical short using the basic effects toolkit while reimagining characters in a SpongeBob-style undersea cartoon world with exaggerated humor and bold colors.',
      weight: 72,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: spongeBobArtStyle?.id,
      captionsStyleId: captionStyles.bubblepop?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'halloween',
      title: 'Halloween',
      description: 'Basic effects sequence drenched in Halloween colors, eerie lighting, and spooky motifs.',
      previewImageUrl: '/template/halloween/preview.jpg',
      previewVideoUrl: '/template/halloween/preview.mp4',
      textPrompt: 'Generate a vertical short using the basic effects toolkit while bathing every scene in Halloween orange-and-purple lighting, foggy ambience, and subtle spooky details.',
      weight: 66,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: halloweenArtStyle?.id,
      captionsStyleId: captionStyles.halloween?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'anime',
      title: 'Anime',
      description: 'Basic effects sequence rendered in vibrant anime aesthetics with expressive characters.',
      previewImageUrl: '/template/anime/preview.jpg',
      previewVideoUrl: '/template/anime/preview.mp4',
      textPrompt: 'Generate a vertical short using the basic effects toolkit while stylising every shot with bold anime lighting, energetic framing, and expressive character poses.',
      weight: 75,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: animeArtStyle?.id,
      captionsStyleId: captionStyles.neondrift?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: '3d',
      title: '3D',
      description: 'Basic effects sequence rendered as soft 3D animations with cinematic depth and lighting.',
      previewImageUrl: '/template/3d/preview.jpg',
      previewVideoUrl: '/template/3d/preview.mp4',
      textPrompt: 'Generate a vertical short using the basic effects toolkit while rendering every scene in stylised soft 3D with cinematic lighting and depth cues.',
      weight: 80,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: threeDArtStyle?.id,
      captionsStyleId: captionStyles.cyberwave?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
    {
      code: 'neo_noir',
      title: 'Neo-Noir',
      description: 'Ink-drenched noir panels with extreme contrast and cinematic tension.',
      previewImageUrl: '/template/noir/preview.jpg',
      previewVideoUrl: '/template/noir/preview.mp4',
      textPrompt: 'Craft a moody neo-noir vertical video using stark black-and-white imagery, dramatic lighting, and gritty textures that sync with the story.',
      weight: 100,
      overlayId: sparklesOverlay.id,
      musicId: defaultMusic.id,
      artStyleId: neoNoirArtStyle?.id,
      captionsStyleId: captionStyles.monoblock?.id ?? captionStyles.acid?.id,
      voiceId: fastFemaleVoiceId || undefined,
    },
  ];

  // Use loose typing for the lookup to avoid TS errors in envs
  // where Prisma Client hasn't been regenerated with the new `code` field.
  const Template: any = (prisma as any).template;

  for (const template of templates) {
    const existing = await Template.findFirst({ where: { code: template.code } });
    if (existing) {
      await Template.update({
        where: { id: existing.id },
        data: { ...template, isPublic: true },
      });
    } else {
      await Template.create({
        data: { ownerId: admin.id, ...template, isPublic: true },
      });
    }
    console.log('Created/updated template:', template.code);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
