import path from 'path';

export function resolveCustomAssetPath(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    // Remote assets are not supported by the CLI; caller must download beforehand.
    return null;
  }
  if (trimmed.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) return null;
    return path.resolve(home, trimmed.slice(1));
  }
  if (path.isAbsolute(trimmed)) {
    if (trimmed.startsWith('/content/')) {
      return path.resolve(process.cwd(), trimmed.slice(1));
    }
    return trimmed;
  }
  const withoutLeadingSlash = trimmed.replace(/^\/+/, '');
  return path.resolve(process.cwd(), withoutLeadingSlash);
}
