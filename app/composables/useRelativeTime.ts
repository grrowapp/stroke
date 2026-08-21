/**
 * 一覧の「最終更新」列に出す相対時刻。
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const elapsed = now - new Date(iso).getTime();

  if (Number.isNaN(elapsed)) return '—';
  if (elapsed < MINUTE) return 'たった今';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}分前`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}時間前`;

  return `${Math.floor(elapsed / DAY)}日前`;
}
