const MAX_UTM_LENGTH = 200;

export const UTM_SOURCE_COOKIE_NAME = 'yc_utm_source';

export function readUtmSourceCookie(value: string | null | undefined) {
  try {
    if (!value) return null;
    const decoded = decodeURIComponent(value).trim();
    return decoded ? decoded.slice(0, MAX_UTM_LENGTH) : null;
  } catch {
    return null;
  }
}
