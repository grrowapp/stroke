import { missingPrerequisites } from '../utils/readiness'
import { LOG_PREFIX } from '../utils/stroke/log'

/**
 * 起動時に、実行中はじめて気付いては困るものを確かめて伝える。
 *
 * ここでは落とさない（specs/startup-readiness）。前提が欠けていてもサービスは起動し、
 * 欠けを必要とする操作の側が受理しない形で表す。判定を持ち越さないため、配置作業や
 * 設定を直せば再起動なしで通るようになる。
 *
 * - 書き込み先: セッションと昇格したプロジェクトの共通の親（`projectShareRoot`）は
 *   アプリ外で用意する前提（ディレクトリの作成と書き込み権限）。
 * - 保存先の形: 相対パスのまま走り出すと、書き込み先がプロセスの cwd 次第で動く。
 * - `claude` の起動定義: ADR 0001 の制約（`--setting-sources project`）を落とすと
 *   スキルが一切ロードされないまま動いてしまう。
 *
 * 設定は `nuxt.config.ts` に書かれたものしか通らない（環境変数から読まない）ので、
 * 実行時に検査しても書き間違い以外は起こらない。その書き間違いを捕まえるための検査である。
 */
export default defineNitroPlugin(async () => {
  const missing = await missingPrerequisites()
  if (missing.length === 0) return

  console.error(
    `${LOG_PREFIX} 前提が欠けている\n${missing.map(p => `  - ${p}`).join('\n')}\n`
    + '  AI の起動はこれらが揃うまで受け付けない。'
    + '配置作業（ディレクトリの作成と権限付与）と、設定（nuxt.config.ts）を確かめること。',
  )
})
