export const TITLE_PREFIX = 'Dummy Status Seed';
export const PLACEHOLDER_IMAGE_URL = 'https://placehold.co/600x800/png';
export const PLACEHOLDER_VIDEO_URL = 'https://static.yumcut.com/api/media/video/2025/10/2dc8d69b-0c6e-4dbe-888e-daf45cd9c7ae.mp4';
export const PLACEHOLDER_AUDIO_URL = 'https://samplelib.com/lib/preview/mp3/sample-6s.mp3';

const LANGUAGE_PARAGRAPHS: Record<string, string> = {
  en: 'YumCut helps small teams turn ideas into snackable clips. In this example narrative, the host shares a friendly greeting, introduces the product, explains how the smart editor removes awkward pauses, and closes with a confident call to action inviting viewers to try the weekly challenge.',
  ru: 'YumCut помогает командам превращать идеи в короткие ролики. В этой демо-истории ведущий приветствует зрителей, рассказывает о продукте, показывает, как умный редактор убирает паузы и оговорки, а в финале уверенно приглашает подписаться на новый челлендж.',
  es: 'YumCut позволяет командам превращать идеи в короткие ролики. В этой демонстрационной истории ведущая приветствует зрителей, показывает приложение, объясняет, как умный редактор удаляет неловкие паузы, и завершает приглашением попробовать еженедельный челлендж.',
  fr: 'YumCut transforme les idées en courtes vidéos engageantes. Dans ce script de démonstration, l’animatrice accueille chaleureusement, présente l’application, explique comment l’éditeur intelligent supprime les hésitations et conclut par un appel à l’action invitant à tester le défi hebdomadaire.',
  de: 'YumCut verwandelt Ideen in kurze Clips mit Mehrwert. In diesem Beispielszenario begrüßt die Moderatorin das Publikum, zeigt die App, erläutert wie der smarte Editor Versprecher entfernt und beendet mit einer Einladung, die wöchentliche Challenge auszuprobieren.',
  pt: 'YumCut transforma ideias em vídeos rápidos e úteis. Neste roteiro de exemplo, a apresentadora cumprimenta quem assiste, mostra o app, explica como o editor inteligente remove silêncios constrangedores e finaliza com um convite animado para experimentar o desafio da semana.',
  it: 'YumCut aiuta i team a trasformare le idee in clip efficaci. In questo copione la presentatrice saluta il pubblico, mostra l’applicazione, spiega come l’editor intelligente elimina i tempi morti e chiude invitando a provare la sfida settimanale.',
};

const MIN_SCRIPT_LENGTH = 360;

export function buildScriptText(languageCode: string): string {
  const base = LANGUAGE_PARAGRAPHS[languageCode.toLowerCase()] ?? LANGUAGE_PARAGRAPHS.en;
  const paragraph = base.trim();
  let output = paragraph;
  while (output.length < MIN_SCRIPT_LENGTH) {
    output += ` ${paragraph}`;
  }
  return output;
}
