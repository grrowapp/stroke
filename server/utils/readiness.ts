import { access, constants } from 'node:fs/promises'
import {
  describeClaudeArgsError,
  describePathsError,
  resolveProjectsRoot,
  resolveSessionsRoot,
} from './stroke/settings'

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

  // チェックする値と、実際に読み書きする値が同じ解決関数から来ることを保つ
  for (const dir of [resolveSessionsRoot(), resolveProjectsRoot()]) {
    try {
      await access(dir, constants.W_OK | constants.X_OK)
    } catch {
      missing.push(`書き込みできない: ${dir}`)
    }
  }

  // 置き場は `.env` で差し替えられる唯一の設定なので、形をなしていない値が入りうる。
  const pathsError = describePathsError()
  if (pathsError) missing.push(`置き場の設定が不正: ${pathsError}`)

  // ADR 0001: `--setting-sources` から `project` が落ちるとスキルが一切ロードされない。
  const argsError = describeClaudeArgsError(useRuntimeConfig().public.claude.args)
  if (argsError) missing.push(`AI の起動定義が不正: ${argsError}`)

  return missing
}
