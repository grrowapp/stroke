/**
 * `javascript-time-ago` の設定が本家の刻みと一致することを固定する。
 *
 * 本家（`dashboard_frontend/src/lib/dateUtils.ts` の `formatDistanceToNow`）は
 * 60秒 / 60分 / 24時間 / 7日 で刻み、7日を超えたら絶対日時に切り替える。丸めは `Math.floor`。
 *
 * 落ちたときに疑う設定を各ケースに書いてある。
 */
import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from '../../../app/composables/useRelativeTime';

const NOW = Date.parse('2026-08-25T12:00:00.000Z');

/** NOW から `ms` だけ過去の ISO 文字列 */
function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it('1分未満は「今」', () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe('今');
    expect(formatRelativeTime(ago(59 * SECOND), NOW)).toBe('今');
  });

  it('1分から1時間未満は分', () => {
    expect(formatRelativeTime(ago(MINUTE), NOW)).toBe('1分前');
    expect(formatRelativeTime(ago(46 * MINUTE), NOW)).toBe('46分前');
    expect(formatRelativeTime(ago(59 * MINUTE), NOW)).toBe('59分前');
  });

  it('1時間から1日未満は時間', () => {
    expect(formatRelativeTime(ago(HOUR), NOW)).toBe('1時間前');
    expect(formatRelativeTime(ago(20 * HOUR), NOW)).toBe('20時間前');
    expect(formatRelativeTime(ago(23 * HOUR), NOW)).toBe('23時間前');
  });

  it('1日から7日未満は日', () => {
    expect(formatRelativeTime(ago(DAY), NOW)).toBe('1日前');
    expect(formatRelativeTime(ago(6 * DAY), NOW)).toBe('6日前');
    expect(formatRelativeTime(ago(6 * DAY + 23 * HOUR), NOW)).toBe('6日前');
  });

  it('7日以上は絶対日時に切り替える（本家の formatDate と同じ）', () => {
    // 週・月・年には刻まない。最後の step の `format` が効いている
    expect(formatRelativeTime(ago(7 * DAY), NOW)).toBe('8月18日 12:00');
    expect(formatRelativeTime(ago(8 * DAY), NOW)).toBe('8月17日 12:00');
    expect(formatRelativeTime(ago(400 * DAY), NOW)).toBe('7月21日 12:00');
  });

  it('端数は切り捨てる', () => {
    // `round: 'floor'` を落とすと既定の 'round' に戻り「2分前」「2時間前」になる
    expect(formatRelativeTime(ago(MINUTE + 59 * SECOND), NOW)).toBe('1分前');
    expect(formatRelativeTime(ago(HOUR + 59 * MINUTE), NOW)).toBe('1時間前');
    expect(formatRelativeTime(ago(23 * HOUR + 59 * MINUTE), NOW)).toBe('23時間前');
  });

  it('数と単位のあいだに空白を入れない', () => {
    // `labels` が 'narrow' 以外だと Intl.RelativeTimeFormat 系になり「46 分前」になる
    expect(formatRelativeTime(ago(46 * MINUTE), NOW)).not.toContain(' ');
  });

  it('未来の時刻は「N分後」', () => {
    expect(formatRelativeTime(ago(-5 * MINUTE), NOW)).toBe('5分後');
    expect(formatRelativeTime(ago(-3 * DAY), NOW)).toBe('3日後');
  });

  it('無効な日付は「—」', () => {
    expect(formatRelativeTime('', NOW)).toBe('—');
    expect(formatRelativeTime('not a date', NOW)).toBe('—');
  });
});
