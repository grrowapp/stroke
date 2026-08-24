import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { OPENSPEC_CONFIG_FILE, OPENSPEC_DIR } from './settings'

const execFileAsync = promisify(execFile)

/**
 * セッションディレクトリを openspec ルートとして初期化する。
 *
 * cwd = セッションディレクトリで `openspec init --tools none` を実行し、`config.yaml` を
 * スキーマ名で上書きする。スキーマの実体は user レベル（`~/.local/share/openspec/schemas/`）
 * から解決される。store はどのコードパスからも使わない。
 *
 * 起こす CLI とその引数は `runtimeConfig.openspec`（既定値は settings.ts）。ルートの
 * ディレクトリ名と `config.yaml` は openspec が決めるものなので固定値で持つ。
 *
 * change はここでは作らない。初回呼び出しの `openspec-ff-change` スキルが
 * `openspec new change` から実行する（design.md 決定1・2）。
 *
 * Nitro に依存する（`useRuntimeConfig()`）。呼び出しは AI の起動経路（ai.ts）だけで、
 * サーバを介さない CLI からは通らない。失敗は素の Error のまま呼び出し側へ届ける。
 */
export async function initSessionOpenspec(sessionDir: string, schemaName: string): Promise<void> {
  const { bin, initArgs } = useRuntimeConfig().openspec
  await execFileAsync(bin, initArgs.split(/\s+/), { cwd: sessionDir })
  await writeFile(
    join(sessionDir, OPENSPEC_DIR, OPENSPEC_CONFIG_FILE),
    `schema: ${schemaName}\n`,
    'utf8',
  )
}
