import type { VoiceOption } from '@/hooks/useVoices';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type VoiceTranslation = {
  title?: string;
  description?: string;
};

const RU_VOICE_TRANSLATIONS_BY_TITLE: Record<string, VoiceTranslation> = {
  Elizabeth: {
    title: 'Элизабет',
    description: 'Профессиональный голос женщины среднего возраста, идеально подходит для закадровой озвучки.',
  },
  Julia: {
    title: 'Джулия',
    description: 'Необычный высокий женский голос с игривой подачей.',
  },
  Olivia: {
    title: 'Оливия',
    description: 'Молодой британский женский голос с дружелюбным и бодрым тоном.',
  },
  Pixie: {
    title: 'Пикси',
    description: 'Высокий, детский женский голос с мультяшным оттенком.',
  },
  Priya: {
    title: 'Прия',
    description: 'Ровный женский голос с индийским акцентом.',
  },
  Sarah: {
    title: 'Сара',
    description: 'Быстрая молодая женская подача с вопросительной и любопытной интонацией.',
  },
  Wendy: {
    title: 'Венди',
    description: 'Чёткий британский женский голос среднего возраста.',
  },
  Ashley: {
    title: 'Эшли',
    description: 'Тёплый и естественный женский голос.',
  },
  Deborah: {
    title: 'Дебора',
    description: 'Мягкий и элегантный женский голос.',
  },
  'Assertive Queen': {
    title: 'Властная королева',
    description: 'Уверенный, но сдержанный голос молодой королевы с американским акцентом.',
  },
  'Captivating Female': {
    title: 'Выразительная дикторша',
    description: 'Яркий женский голос с американским акцентом, хорошо подходит для новостей и документалок.',
  },
  'Compelling Lady': {
    title: 'Убедительная леди',
    description: 'Выразительный женский голос с британским акцентом для официальной подачи.',
  },
  'Confident Woman': {
    title: 'Уверенная женщина',
    description: 'Уверенный молодой женский голос с американским акцентом.',
  },
  'Female Narrator': {
    title: 'Женский диктор',
    description: 'Искренний голос женщины среднего возраста с британским акцентом для доверительного сторителлинга.',
  },
  'Graceful Lady': {
    title: 'Изящная леди',
    description: 'Элегантный женский голос среднего возраста с классическим британским акцентом.',
  },
  'Imposing Queen': {
    title: 'Грозная королева',
    description: 'Мощный голос королевы с британским акцентом, звучит авторитетно.',
  },
  'Lovely Girl': {
    title: 'Милая девушка',
    description: 'Мягкий юный женский голос с британским акцентом.',
  },
  'Playful Girl': {
    title: 'Игривый голос',
    description: 'Игривый юный женский голос с американским акцентом, подходит для мультформатов.',
  },
  'Radiant Girl': {
    title: 'Яркая девушка',
    description: 'Живой и энергичный молодой женский голос с американским акцентом.',
  },
  'Stressed Lady': {
    title: 'Взволнованная леди',
    description: 'Неуверенный голос женщины среднего возраста с американским акцентом, передаёт тревогу.',
  },
  'Upbeat Woman': {
    title: 'Позитивная женщина',
    description: 'Яркий женский голос с американским акцентом для энергичной подачи.',
  },
  'Upset Girl': {
    title: 'Расстроенная девушка',
    description: 'Молодой женский голос с британским акцентом, хорошо передаёт грусть и напряжение.',
  },
  'Whimsical Girl': {
    title: 'Фантазийный голос',
    description: 'Игривый, но осторожный молодой женский голос с американским акцентом.',
  },
  'Wise Lady': {
    title: 'Мудрая леди',
    description: 'Добрый и рассудительный голос женщины среднего возраста с британским акцентом.',
  },
  'Bossy Lady': {
    title: 'Властная леди',
    description: 'Зрелый женский голос среднего возраста с американским акцентом и командной подачей.',
  },
  'Calm Woman': {
    title: 'Спокойная женщина',
    description: 'Спокойный и мягкий женский голос с американским акцентом для аудиокниг и медитативной подачи.',
  },
  'Kind-Hearted Girl': {
    title: 'Добрая девушка',
    description: 'Добрый и спокойный молодой женский голос с американским акцентом.',
  },
  'Sentimental Lady': {
    title: 'Сентиментальная леди',
    description: 'Эмоциональный и элегантный голос женщины среднего возраста с британским акцентом.',
  },
  'Serene Woman': {
    title: 'Умиротворённая женщина',
    description: 'Спокойный и дружелюбный молодой женский голос с американским акцентом.',
  },
  'Soft-Spoken Girl': {
    title: 'Тихий юный голос',
    description: 'Мягкий и спокойный юный женский голос с американским акцентом.',
  },
  Brittney: {
    title: 'Бритни',
    description: 'Молодой яркий женский голос.',
  },
  'Hope (Podcaster)': {
    title: 'Хоуп (подкастер)',
    description: 'Тон подкаста: тёплое, близкое звучание микрофона.',
  },
  Nayva: {
    title: 'Найва',
    description: 'Дерзкий голос для контента в соцсетях.',
  },
  Hope: {
    title: 'Хоуп',
    description: 'Женский естественный разговорный голос.',
  },
  'Hope (Flirty)': {
    title: 'Хоуп (кокетливо)',
    description: 'Кокетливая и мягкая подача.',
  },
  Serafina: {
    title: 'Серафина',
    description: 'Кокетливая манера речи.',
  },
  Alex: { title: 'Алекс' },
  Craig: {
    title: 'Крэйг',
    description: 'Британский мужской голос старшего возраста с чёткой и изысканной дикцией.',
  },
  Edward: {
    title: 'Эдвард',
    description: 'Мужской голос с быстрой, подчёркнутой и уличной подачей.',
  },
  Hades: {
    title: 'Аид',
    description: 'Командный грубоватый мужской голос, как всеведущий рассказчик или страж замка.',
  },
  Mark: { title: 'Марк' },
  Shaun: {
    title: 'Шон',
    description: 'Дружелюбный динамичный мужской голос для разговорного формата.',
  },
  Theodore: {
    title: 'Теодор',
    description: 'Хрипловатый мужской голос с ощущением прожитого опыта.',
  },
  Timothy: {
    title: 'Тимоти',
    description: 'Живой бодрый американский мужской голос.',
  },
  Dennis: {
    title: 'Деннис',
    description: 'Спокойный и дружелюбный голос мужчины среднего возраста.',
  },
  Dominus: {
    title: 'Доминус',
    description: 'Роботизированный низкий мужской голос с угрожающим оттенком, подходит для злодейских ролей.',
  },
  Ronald: {
    title: 'Рональд',
    description: 'Уверенный британский мужской голос с глубоким хриплым тембром.',
  },
  'Aussie Bloke': {
    title: 'Австралийский парень',
    description: 'Дружелюбный яркий мужской голос с выраженным австралийским акцентом.',
  },
  'Bossy Leader': {
    title: 'Властный лидер',
    description: 'Командный мужской голос с американским акцентом и уверенной подачей.',
  },
  'Captivating Storyteller': {
    title: 'Захватывающий рассказчик',
    description: 'Выразительный голос пожилого рассказчика с сдержанной подачей и американским акцентом.',
  },
  Comedian: {
    title: 'Комик',
    description: 'Лёгкий молодой мужской голос с британским акцентом и юмористической интонацией.',
  },
  'Decent Young Man': {
    title: 'Порядочный молодой человек',
    description: 'Вежливый мужской голос с британским акцентом.',
  },
  'Diligent Man': {
    title: 'Старательный мужчина',
    description: 'Искренний мужской голос с индийским акцентом.',
  },
  'Expressive Narrator': {
    title: 'Выразительный рассказчик',
    description: 'Выразительный мужской голос с британским акцентом для увлекательной подачи.',
  },
  'Friendly Guy': {
    title: 'Дружелюбный парень',
    description: 'Естественный мужской голос с американским акцентом в дружелюбной манере.',
  },
  'Magnetic-voiced Male': {
    title: 'Харизматичный голос',
    description: 'Притягательный мужской голос с американским акцентом, подходит для рекламы.',
  },
  'Male Debater': {
    title: 'Дебатёр',
    description: 'Жёсткий мужской голос среднего возраста с американским акцентом для спорной и уверенной подачи.',
  },
  'Passionate Warrior': {
    title: 'Страстный воин',
    description: 'Энергичный молодой мужской голос с американским акцентом и боевым настроем.',
  },
  'Reliable Man': {
    title: 'Надёжный мужчина',
    description: 'Молодой мужской голос с американским акцентом, звучит уверенно и надёжно.',
  },
  'Reserved Young Man': {
    title: 'Сдержанный молодой человек',
    description: 'Сдержанный и холодный мужской голос с американским акцентом.',
  },
  'Teen Boy': {
    title: 'Подросток',
    description: 'Недовольный молодой мужской голос с британским акцентом для подросткового персонажа.',
  },
  'Trustworthy Man': {
    title: 'Надёжный диктор',
    description: 'Убедительный резонансный мужской голос с американским акцентом.',
  },
  'Wise Scholar': {
    title: 'Мудрый учёный',
    description: 'Разговорный молодой мужской голос с британским акцентом, понятно объясняет сложные темы.',
  },
  'Deep-voiced Gentleman': {
    title: 'Глубокий голос джентльмена',
    description: 'Низкий и мудрый мужской голос с классическим британским акцентом.',
  },
  'Gentle-voiced Man': {
    title: 'Мягкий мужской голос',
    description: 'Мягкий и звучный мужской голос с американским акцентом, тёплая подача.',
  },
  'Jovial Man': {
    title: 'Жизнерадостный мужчина',
    description: 'Весёлый мужской голос среднего возраста с американским акцентом.',
  },
  'Man With Deep Voice': {
    title: 'Мужчина с глубоким голосом',
    description: 'Низкий и уверенный мужской голос с американским акцентом.',
  },
  'Mature Partner': {
    title: 'Зрелый партнёр',
    description: 'Мягкий мужской голос среднего возраста с британским акцентом.',
  },
  'Strong-Willed Boy': {
    title: 'Волевой юноша',
    description: 'Зрелый по звучанию молодой мужской голос с британским акцентом.',
  },
  Finn: {
    title: 'Финн',
    description: 'Разговорный молодой мужской голос с уверенной живой подачей.',
  },
  Peter: {
    title: 'Питер',
    description: 'Уверенный и надёжный мужской голос диктора.',
  },
};

const RU_VOICE_TRANSLATIONS_BY_PROVIDER_AND_TITLE: Record<string, VoiceTranslation> = {
  'inworld|alex': {
    title: 'Алекс',
    description: 'Энергичный и выразительный мужской голос среднего диапазона с лёгкой носовой окраской.',
  },
  'elevenlabs|alex': {
    title: 'Алекс',
    description: 'Бодрый и приятный мужской голос.',
  },
  'inworld|mark': {
    title: 'Марк',
    description: 'Энергичный выразительный мужской голос с быстрым темпом.',
  },
  'elevenlabs|mark': {
    title: 'Марк',
    description: 'Непринуждённый молодой мужской голос с естественной подачей.',
  },
};

function normalizeKey(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function localizeVoiceOption(voice: VoiceOption, appLanguage: AppLanguageCode): { title: string; description: string | null } {
  if (appLanguage !== 'ru') {
    return {
      title: voice.title,
      description: voice.description ?? null,
    };
  }

  const providerKey = `${normalizeKey(voice.voiceProvider)}|${normalizeKey(voice.title)}`;
  const translatedByProvider = RU_VOICE_TRANSLATIONS_BY_PROVIDER_AND_TITLE[providerKey];
  const translatedByTitle = RU_VOICE_TRANSLATIONS_BY_TITLE[voice.title];
  const translated = translatedByProvider ?? translatedByTitle;
  return {
    title: translated?.title ?? voice.title,
    description: translated?.description ?? voice.description ?? null,
  };
}
