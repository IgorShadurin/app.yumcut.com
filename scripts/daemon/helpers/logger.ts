import { persistProjectErrorLog } from './error-logs';

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

const SILENT_MODE = (() => {
  if (process.env.DAEMON_LOGS_VERBOSE === '1') return false;
  if (process.env.DAEMON_LOGS_SILENT === '1') return true;
  if (process.env.DAEMON_LOGS_SILENT === '0') return false;
  return process.env.NODE_ENV === 'test';
})();

function stamp() {
  const d = new Date();
  return d.toISOString();
}

export const log = {
  info(msg: string, meta?: Record<string, unknown>) {
    if (SILENT_MODE) return;
    // keep concise
    // eslint-disable-next-line no-console
    console.log(`[${stamp()}] INFO  ${msg}${meta ? ' ' + JSON.stringify(meta, null, 2) : ''}`);
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    if (SILENT_MODE) return;
    // eslint-disable-next-line no-console
    console.warn(`[${stamp()}] WARN  ${msg}${meta ? ' ' + JSON.stringify(meta, null, 2) : ''}`);
  },
  error(msg: string, meta?: Record<string, unknown>) {
    const now = stamp();
    // eslint-disable-next-line no-console
    console.error(`[${now}] ERROR ${msg}${meta ? ' ' + JSON.stringify(meta, null, 2) : ''}`);
    const projectId =
      meta?.projectId
      ?? (typeof meta?.project === 'object' && meta?.project && 'id' in (meta.project as Record<string, unknown>)
        ? (meta.project as Record<string, unknown>).id
        : null);
    const payload = {
      message: msg,
      timestamp: now,
      meta: meta ?? {},
    };
    if (projectId) {
      void persistProjectErrorLog(projectId, payload);
    }
  },
  debug(msg: string, meta?: Record<string, unknown>) {
    if (!DEBUG || SILENT_MODE) return;
    // eslint-disable-next-line no-console
    console.debug(`[${stamp()}] DEBUG ${msg}${meta ? ' ' + JSON.stringify(meta, null, 2) : ''}`);
  },
};
