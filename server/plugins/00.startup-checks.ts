import { missingPrerequisites } from '../utils/readiness'
import { LOG_PREFIX } from '../utils/stroke/settings'

/**
 * 起動時に、実行中はじめて気付いては困るものを確かめて伝える。
 *
 * ここでは落とさない（specs/startup-readiness）。前提が欠けていてもサービスは起動し、
 * 欠けを必要とする操作の側が受理しない形で表す。判定を持ち越さないため、配置作業や
 * 設定を直せば再起動なしで通るようになる。
 *
 * - 書き込み先: セッションディレクトリの置き場とプロジェクトの生成先はどちらもアプリ外で
 *   用意する前提（`/var/lib/stroke-board/` の作成と所有権付与、`/opt/projects/` への
 *   書き込み権限）。
 * - 置き場の設定: `.env` で差し替えられる唯一の設定なので、形をなしていない値が入りうる。
 *   相対パスのまま走り出すと、書き込み先が cwd 次第で動く。
 * - `claude` の起動定義: 環境変数では差し替わらないが、ADR 0001 の制約
 *   （`--setting-sources project`）を落とすとスキルが一切ロードされないまま動いてしまう。
 *
 * 検査がこの3つなのは、環境変数から値が入る経路が置き場だけになったためである。他の値は
 * `nuxt.config.ts` と `settings.ts` に書かれたものしか通らないので、実行時に検査しても
 * 書き間違い以外は起こらない。
 */
export default defineNitroPlugin(async () => {
  const missing = await missingPrerequisites()
  if (missing.length === 0) return

  console.error(
    `${LOG_PREFIX} 前提が欠けている\n${missing.map(p => `  - ${p}`).join('\n')}\n`
    + '  AI の起動はこれらが揃うまで受け付けない。'
    + '配置作業（ディレクトリの作成と権限付与）と、設定（置き場は .env / 環境変数、'
    + '一覧は .env.example。それ以外は nuxt.config.ts）を確かめること。',
  )
})
