import { access, constants } from 'node:fs/promises'
import { describeClaudeConfigError } from '../utils/stroke/claude-config'
import { PROJECTS_ROOT, SESSIONS_ROOT } from '../utils/stroke/paths'

/**
 * 起動時に、実行中はじめて気付いては困るものを確かめる。
 *
 * - 書き込み先: セッションディレクトリの置き場とプロジェクトの生成先はどちらもアプリ外で
 *   用意する前提（`/var/lib/stroke-board/` の作成と所有権付与、`/opt/projects/` への
 *   書き込み権限）。
 * - AI の起動設定: `runtimeConfig` は環境変数で差し替えられるため、形をなしていない値が
 *   入りうる。特に `timeoutMs` が数でないと、全ての呼び出しが即タイムアウトになる。
 */
export default defineNitroPlugin(async () => {
  const problems: string[] = []

  for (const dir of [SESSIONS_ROOT, PROJECTS_ROOT]) {
    try {
      await access(dir, constants.W_OK | constants.X_OK)
    } catch {
      problems.push(`書き込みできない: ${dir}`)
    }
  }

  const configError = describeClaudeConfigError()
  if (configError) problems.push(`AI の起動設定が不正: ${configError}`)

  if (problems.length > 0) {
    console.error(
      `[stroke-board] 起動できない\n${problems.map(p => `  - ${p}`).join('\n')}\n`
      + '  配置作業（ディレクトリの作成と権限付与）と runtimeConfig.claude を確かめること。',
    )
    // Nitro のプラグインで throw しても、サーバはそのままリクエストを受け付けてしまう。
    // 「実行中に初めて気付く」形にしないため、プロセスごと落とす。
    process.exit(1)
  }
})
