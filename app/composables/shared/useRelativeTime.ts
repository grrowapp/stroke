/**
 * 一覧の「最終更新」列に出す相対時刻。
 *
 * 刻みと文言は vueuse の `formatTimeAgo` に載せる。既定のままだと現行と挙動が変わるため、
 * 次の3つを明示している。
 *
 * - `units`: 既定は minute の上限が 46 分・hour が 20 時間という人間的な丸めで、
 *   さらに週・月・年まで刻む。ここは 60 分 / 24 時間で切り、day を最大単位にする
 * - `rounding`: 既定は `'round'`。切り捨てにする
 * - `messages.future`: 既定は未来を「〜後」と出す。ここは未来を区別せず「たった今」にする
 */
import { formatTimeAgo } from '@vueuse/core';

type Unit = 'second' | 'minute' | 'hour' | 'day';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 秒は出さない（`showSecond` 既定 false）。1分未満は「たった今」に畳まれる */
const UNITS = [
  { max: MINUTE, value: SECOND, name: 'second' },
  { max: HOUR, value: MINUTE, name: 'minute' },
  { max: DAY, value: HOUR, name: 'hour' },
  { max: Number.POSITIVE_INFINITY, value: DAY, name: 'day' },
] as const satisfies { max: number; value: number; name: Unit }[];

const MESSAGES = {
  justNow: 'たった今',
  past: '{0}前',
  // 未来の時刻は区別しない。現行は負の経過時間を「たった今」に畳んでいた
  future: () => 'たった今',
  invalid: '—',
  second: (n: number) => `${n}秒`,
  minute: (n: number) => `${n}分`,
  hour: (n: number) => `${n}時間`,
  day: (n: number) => `${n}日`,
};

export function formatRelativeTime(iso: string, now = Date.now()): string {
  return formatTimeAgo<Unit>(
    new Date(iso),
    { units: [...UNITS], messages: MESSAGES, rounding: 'floor' },
    now,
  );
}
