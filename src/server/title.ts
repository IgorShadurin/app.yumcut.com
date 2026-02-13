export function deriveTitleFromText(text: string, maxLen = 80): string {
  const cleaned = text.replace(/[\r\n\t]+/g, ' ').replace(/<[^>]*>/g, '').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1).trimEnd() + '…';
}

