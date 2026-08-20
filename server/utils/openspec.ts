import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readClaudeConfig } from './claude-config'

const execFileAsync = promisify(execFile)

/**
 * セッションはワークフロー定義を置いた store 上の change（design.md 決定3）。
 * セッションを作った時点でここに change を作っておき、claude は cwd に依らず
 * `--store <id>` で参照する。
 *
 * スキーマは store の `config.yaml` が既定として持つので指定しない（実測: `--schema` を
 * 省いても `stroke-session` で作られる）。
 */
export async function createSessionChange(sessionId: string): Promise<void> {
  const { storeId } = readClaudeConfig()

  try {
    await execFileAsync('openspec', ['new', 'change', sessionId, '--store', storeId, '--json'])
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: `セッションの change を作れなかった: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
