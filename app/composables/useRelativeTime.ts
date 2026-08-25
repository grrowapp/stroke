/**
 * 一覧の「最終更新」列に出す相対時刻。
 *
 * 刻み・文言・絶対日時への切り替えは `javascript-time-ago` に載せる。**自前で書くのは
 * 無効な日付のガード1行だけ**で、閾値の判定も日本語の文言も丸めもライブラリが持つ。
 *
 * 本家（`dashboard_frontend/src/lib/dateUtils.ts` の `formatDistanceToNow`）は
 * 60秒 / 60分 / 24時間 / 7日 で刻み、**7日を超えたら相対表記をやめて絶対日時**
 * （`formatDate`）に切り替える。`steps` はその閾値をそのまま写したもの。
 *
 * - `labels: 'narrow'` — `Intl.RelativeTimeFormat` 系（`long` / `short` / `mini`）は
 *   「46 分前」と空白が入る。`narrow` だけが「46分前」になる（実測）
 * - `round: 'floor'` — 既定は `'round'` で、1分59秒が「2分前」になる。本家は `Math.floor`
 * - 最後の step の `format` が7日超の絶対日時。**分岐は書かない**（step の切り替えで表現する）
 *
 * vueuse の `formatTimeAgo` は採らない。日本語の文言8種を手で書く必要があり、`formatTimeAgoIntl`
 * は「昨日」「先週」「先月」「昨年」という本家に無い表現を出す（いずれも実測）。
 */
import TimeAgo from 'javascript-time-ago';
import ja from 'javascript-time-ago/locale/ja';

import type { Style } from 'javascript-time-ago';

TimeAgo.addLocale(ja);

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * 7日を超えたときに出す絶対日時。本家の `formatDate` は
 * `toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })`。
 * ロケールは日本語で固定する（`ApprovalCard` の日時と同じ扱い）。
 */
const FULL_DATE = new Intl.DateTimeFormat('ja-JP', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 閾値は本家の `formatDistanceToNow` の写し。単位は秒 */
const STYLE: Style = {
  labels: 'narrow',
  round: 'floor',
  steps: [
    { formatAs: 'now' },
    { minTime: MINUTE, formatAs: 'minute' },
    { minTime: HOUR, formatAs: 'hour' },
    { minTime: DAY, formatAs: 'day' },
    { minTime: WEEK, format: (value: number) => FULL_DATE.format(new Date(value)) },
  ],
};

const timeAgo = new TimeAgo('ja-JP');

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return timeAgo.format(date, STYLE, { now });
}
