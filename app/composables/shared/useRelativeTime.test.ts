/**
 * `formatTimeAgo` に載せ替えても出力が変わらないことを固定する。
 *
 * vueuse の既定は minute の上限が 46 分、hour が 20 時間で、さらに週・月・年まで刻む。
 * `units` の指定を落とすとここが落ちる。
 */
import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from './useRelativeTime';

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
  it('1分未満は「たった今」', () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe('たった今');
    expect(formatRelativeTime(ago(59 * SECOND), NOW)).toBe('たった今');
  });

  it('1分から1時間未満は分', () => {
    expect(formatRelativeTime(ago(MINUTE), NOW)).toBe('1分前');
    // 既定 units だと 46 分で「1時間前」になる。60 分まで分で出す
    expect(formatRelativeTime(ago(46 * MINUTE), NOW)).toBe('46分前');
    expect(formatRelativeTime(ago(59 * MINUTE), NOW)).toBe('59分前');
  });

  it('1時間から1日未満は時間', () => {
    expect(formatRelativeTime(ago(HOUR), NOW)).toBe('1時間前');
    // 既定 units だと 20 時間で「1日前」になる
    expect(formatRelativeTime(ago(20 * HOUR), NOW)).toBe('20時間前');
    expect(formatRelativeTime(ago(23 * HOUR), NOW)).toBe('23時間前');
  });

  it('1日以上は日。週・月・年には刻まない', () => {
    expect(formatRelativeTime(ago(DAY), NOW)).toBe('1日前');
    expect(formatRelativeTime(ago(30 * DAY), NOW)).toBe('30日前');
    expect(formatRelativeTime(ago(400 * DAY), NOW)).toBe('400日前');
  });

  it('端数は切り捨てる', () => {
    // 既定の 'round' だと「2分前」になる
    expect(formatRelativeTime(ago(MINUTE + 59 * SECOND), NOW)).toBe('1分前');
    expect(formatRelativeTime(ago(HOUR + 59 * MINUTE), NOW)).toBe('1時間前');
  });

  it('未来の時刻は「たった今」', () => {
    expect(formatRelativeTime(ago(-5 * MINUTE), NOW)).toBe('たった今');
    expect(formatRelativeTime(ago(-3 * DAY), NOW)).toBe('たった今');
  });

  it('無効な日付は「—」', () => {
    expect(formatRelativeTime('', NOW)).toBe('—');
    expect(formatRelativeTime('not a date', NOW)).toBe('—');
  });
});
