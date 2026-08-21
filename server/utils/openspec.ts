import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * セッションディレクトリを openspec ルートとして初期化する。
 *
 * cwd = セッションディレクトリで `openspec init --tools none` を実行し、`config.yaml` を
 * スキーマ名で上書きする。スキーマの実体は user レベル（`~/.local/share/openspec/schemas/`）
 * から解決される。store はどのコードパスからも使わない。
 *
 * change はここでは作らない。初回呼び出しの `openspec-ff-change` スキルが
 * `openspec new change` から実行する（design.md 決定1・2）。
 *
 * Nitro に依存しない。失敗は素の Error のまま呼び出し側（session-core）へ届ける。
 */
export async function initSessionOpenspec(sessionDir: string, schemaName: string): Promise<void> {
  await execFileAsync('openspec', ['init', '--tools', 'none'], { cwd: sessionDir })
  await writeFile(join(sessionDir, 'openspec', 'config.yaml'), `schema: ${schemaName}\n`, 'utf8')
}
