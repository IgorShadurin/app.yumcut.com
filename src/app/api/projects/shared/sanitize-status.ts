const SENSITIVE_STATUS_KEYS = new Set([
  'videoLogs',
  'videoErrors',
  'finalVideoPaths',
  'videoWorkspace',
  'videoWorkspaceRoot',
  'videoWorkspacesByLanguage',
  'sharedImagesLogDir',
  'imagesWorkspace',
  'imagesWorkspaceRoot',
  'imagesLog',
  'logs',
]);

export function sanitizeStatusInfoForUser(statusInfo: Record<string, unknown> | undefined) {
  if (!statusInfo) return statusInfo;
  const clone: Record<string, unknown> = { ...statusInfo };
  for (const key of Object.keys(clone)) {
    if (SENSITIVE_STATUS_KEYS.has(key)) {
      delete clone[key];
    }
  }
  return clone;
}
