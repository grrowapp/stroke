import { missingPrerequisites } from '../utils/readiness'

/**
 * 起動時に、実行中はじめて気付いては困るものを確かめて伝える。
 *
 * ここでは落とさない（specs/startup-readiness）。前提が欠けていてもサービスは起動し、
 * 欠けを必要とする操作の側が受理しない形で表す。判定を持ち越さないため、配置作業や
 * `runtimeConfig.claude` を直せば再起動なしで通るようになる。
 *
 * - 書き込み先: セッションディレクトリの置き場とプロジェクトの生成先はどちらもアプリ外で
 *   用意する前提（`/var/lib/stroke-board/` の作成と所有権付与、`/opt/projects/` への
 *   書き込み権限）。
 * - AI の起動設定: `runtimeConfig` は環境変数で差し替えられるため、形をなしていない値が
 *   入りうる。
 */
export default defineNitroPlugin(async () => {
  const missing = await missingPrerequisites()
  if (missing.length === 0) return

  console.error(
    `[stroke-board] 前提が欠けている\n${missing.map(p => `  - ${p}`).join('\n')}\n`
    + '  AI の起動はこれらが揃うまで受け付けない。'
    + '配置作業（ディレクトリの作成と権限付与）と runtimeConfig.claude を確かめること。',
  )
})
