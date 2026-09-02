import { access, constants } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { describeClaudeArgsError, readStrokeConfig } from './stroke/config'

/**
 * AI の起動に必要な前提が揃っているかを確かめる
 * （openspec/specs/api/session/invoke-agent「前提が欠けている間は起動を受け付けない」）。
 *
 * 判定結果は保持しない。呼ばれるたびに実際の書き込み可否と設定を見るため、欠けていた
 * 前提が後から満たされれば、サービスを再起動せずに通るようになる。
 *
 * @returns 欠けている前提。1つずつ独立した文言で返し、全て揃っていれば空。
 */
export async function missingPrerequisites(): Promise<string[]> {
  const missing: string[] = []

  let config
  try {
    config = readStrokeConfig()
  } catch (error) {
    // 設定そのものが読めないなら、他の検査は成立しない。
    return [error instanceof Error ? error.message : String(error)]
  }

  // 相対パスのまま走り出すと、書き込み先がプロセスの cwd 次第で動く。
  const root = config.projectShareRoot
  if (!isAbsolute(root)) {
    missing.push(`保存先が絶対パスでない: ${root}`)
  } else {
    // チェックする値と、実際に読み書きする値が同じ設定から来ることを保つ。
    // セッションも昇格したプロジェクトもこの1つの親の下に置く。
    try {
      await access(root, constants.W_OK | constants.X_OK)
    } catch {
      missing.push(`書き込みできない: ${root}`)
    }
  }

  // ADR 0001 の `--setting-sources project` が並びに在るか。**いまこの検査は実効を持たない**
  // ——`--add-dir` を外して以降、project 設定の探索先はセッションの cwd だけで、そこに
  // `.claude/` は無いため、`project` の有無に関わらずロードされるスキルは0本である。
  // 案内スキルを配り直したときに要る守りとして残してある（`describeClaudeArgsError` の
  // 注記。santa-method レビュー指摘 7周目 2026-08-30）。
  const argsError = describeClaudeArgsError(config.claude.args)
  if (argsError) missing.push(`AI の起動定義が不正: ${argsError}`)

  return missing
}
