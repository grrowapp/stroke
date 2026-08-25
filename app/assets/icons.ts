/**
 * アイコンのコレクション定義。
 *
 * `UIcon` に載せるための入れ物であって、**アイコンセットを選び直したものではない**。
 * パスも描画属性も、それぞれの出どころからそのまま持ち込んでいる。絵は変えない。
 *
 * 出どころは2系統あり、混ぜると後からどちらに合わせているのか分からなくなるので、
 * コレクションを分けて名前空間で区別する。
 *
 * - `sb:`       prototype（archive の steering-dashboard-portal/prototype/navigation.prototype.html）
 * - `upstream:` 本家 spec-workflow-mcp のソース
 *
 * 上層は prototype、下層とトーストは本家、という切り分けはこの2つの使い分けで表す。
 */
import type { IconifyJSON } from '@iconify/types';

/**
 * prototype の元の定義:
 *   const SVG=(d,s=16)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"
 *     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
 *     <path d="${d}"/></svg>`;
 *
 * 描画属性は svg 要素に付いていたが、IconifyJSON の body は svg の中身なので path 側へ移す。
 * 継承が直接指定に変わるだけで、描画結果は同じ。
 */
function strokePath(d: string): string {
  return `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const SB_PATHS = {
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  folder: 'M3 7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  plus: 'M12 5v14M5 12h14',
  link: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
  back: 'M15 18l-6-6 6-6',
  down: 'M6 9l6 6 6-6',
  grid: 'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z',
  x: 'M18 6L6 18M6 6l12 12',
} as const;

/**
 * 本家のアイコン。`fill="none" stroke="currentColor"` は svg 要素、
 * `stroke-width` / `linecap` / `linejoin` は path 要素に付いていた。まとめて path 側へ移す。
 *
 * `eye` だけは2本のパスで1つの絵を作る。
 */
const UPSTREAM_PATHS = {
  /** modules/notifications/NotificationProvider.tsx の error */
  'alert-circle': ['M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
  /** 同 warning */
  'alert-triangle': ['M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z'],
  /** 同 success。承認のナビゲーション項目でも本家はこれを使う */
  'check-circle': ['M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'],
  /** 同 info */
  'info-circle': ['M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],

  /** 統計。PageNavigationSidebar の nav.statistics（本家のルート＝ダッシュボード） */
  statistics: [
    'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  ],
  /** 文書。SpecsPage / SteeringPage の行頭タイルと nav.specs で使われている */
  document: [
    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  ],
  /** ステアリング。PageNavigationSidebar の nav.steering */
  steering: [
    'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
  ],
  /** タスク。SpecsPage の件数表示と nav.tasks */
  tasks: [
    'M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  ],
  /** 最終更新の前に付く時計。SpecsPage の SpecCard */
  clock: ['M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'],
  /** 発生時刻の前に付くカレンダー。ApprovalsPage のカード */
  calendar: [
    'M8 7V3a1 1 0 011-1h6a1 1 0 011 1v4m-6 0h6M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-2',
  ],

  /** 行の右端。本家は「開く」を目のアイコンで表している（2本のパスで1つの絵） */
  eye: [
    'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
  ],
  /** カード表示のときの右端 */
  'chevron-right': ['M9 5l7 7-7 7'],
  /**
   * サイドバーを畳む。PageNavigationSidebar の collapse ボタン。
   * 本家は畳んだときこの絵を 180 度回して「開く」に使う（別の絵を持たない）。
   */
  'chevron-double-left': ['M11 19l-7-7 7-7m8 14l-7-7 7-7'],
  /** トーストの閉じる */
  close: ['M6 18L18 6M6 6l12 12'],
  /** 指摘の見出しに付く吹き出し。ApprovalsAnnotator の Comments & Feedback */
  chat: [
    'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  ],
} as const;

export type SbIconName = keyof typeof SB_PATHS;
export type UpstreamIconName = keyof typeof UPSTREAM_PATHS;

export const sbIcons: IconifyJSON = {
  prefix: 'sb',
  width: 24,
  height: 24,
  icons: Object.fromEntries(
    Object.entries(SB_PATHS).map(([name, d]) => [name, { body: strokePath(d) }]),
  ),
};

export const upstreamIcons: IconifyJSON = {
  prefix: 'upstream',
  width: 24,
  height: 24,
  icons: Object.fromEntries(
    Object.entries(UPSTREAM_PATHS).map(([name, paths]) => [
      name,
      { body: paths.map(strokePath).join('') },
    ]),
  ),
};
