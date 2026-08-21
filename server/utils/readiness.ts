import { access, constants } from 'node:fs/promises'
import { describeClaudeConfigError } from './claude-config'
import { PROJECTS_ROOT, SESSIONS_ROOT } from './paths'

/**
 * 実行中はじめて気付いては困る前提が揃っているかを確かめる（specs/startup-readiness）。
 *
 * 判定結果は保持しない。呼ばれるたびに実際の書き込み可否と設定を見るため、欠けていた
 * 前提が後から満たされれば、サービスを再起動せずに通るようになる（design.md 決定2）。
 *
 * @returns 欠けている前提。1つずつ独立した文言で返し、全て揃っていれば空。
 */
export async function missingPrerequisites(): Promise<string[]> {
  const missing: string[] = []

  for (const dir of [SESSIONS_ROOT, PROJECTS_ROOT]) {
    try {
      await access(dir, constants.W_OK | constants.X_OK)
    } catch {
      missing.push(`書き込みできない: ${dir}`)
    }
  }

  // `runtimeConfig` は環境変数で差し替えられるため、形をなしていない値が入りうる。
  // 特に `timeoutMs` が数でないと、全ての呼び出しが即タイムアウトになる。
  const configError = describeClaudeConfigError()
  if (configError) missing.push(`AI の起動設定が不正: ${configError}`)

  return missing
}
