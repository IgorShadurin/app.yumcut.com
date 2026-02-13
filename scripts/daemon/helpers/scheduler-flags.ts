export function isVerboseScheduler(): boolean {
  const raw = process.env.DAEMON_VERBOSE_SCHEDULER;
  if (!raw) return false;
  if (raw === '1' || raw === '0') return raw === '1';
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
