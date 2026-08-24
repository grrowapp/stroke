import { access, constants } from 'node:fs/promises'
import {
  LOG_PREFIX,
  describeClaudeArgsError,
  describePathsError,
  resolveProjectsRoot,
  resolveSessionsRoot,
} from '../utils/stroke/settings'

/**
 * 起動時に、実行中はじめて気付いては困るものを確かめる。
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
  const problems: string[] = []

  // チェックする値と、実際に読み書きする値が同じ解決関数から来ることを保つ
  for (const dir of [resolveSessionsRoot(), resolveProjectsRoot()]) {
    try {
      await access(dir, constants.W_OK | constants.X_OK)
    } catch {
      problems.push(`書き込みできない: ${dir}`)
    }
  }

  const pathsError = describePathsError()
  if (pathsError) problems.push(`置き場の設定が不正: ${pathsError}`)

  const argsError = describeClaudeArgsError(useRuntimeConfig().public.claude.args)
  if (argsError) problems.push(`AI の起動定義が不正: ${argsError}`)

  if (problems.length > 0) {
    console.error(
      `${LOG_PREFIX} 起動できない\n${problems.map(p => `  - ${p}`).join('\n')}\n`
      + '  配置作業（ディレクトリの作成と権限付与）と、設定（置き場は .env / 環境変数、'
      + '一覧は .env.example。それ以外は nuxt.config.ts）を確かめること。',
    )
    // Nitro のプラグインで throw しても、サーバはそのままリクエストを受け付けてしまう。
    // 「実行中に初めて気付く」形にしないため、プロセスごと落とす。
    process.exit(1)
  }
})
