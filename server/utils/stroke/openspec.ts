import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * セッションの openspec ルート。名前は openspec が決めるもので、こちらは従う。
 * 設定ではない（docs/specs/core/settings-reference.md）。
 */
export const OPENSPEC_DIR = 'openspec'
export const OPENSPEC_CONFIG_FILE = 'config.yaml'

/**
 * セッションディレクトリを openspec ルートとして初期化する。
 *
 * cwd = セッションディレクトリで `openspec init --tools none` を実行し、`config.yaml` を
 * スキーマ名で上書きする。スキーマの実体は user レベル（`~/.local/share/openspec/schemas/`）
 * から解決される。store はどのコードパスからも使わない。
 *
 * 起こす CLI とその引数（`bin` / `initArgs`）とスキーマ名は、呼び出し側が設定から引いて
 * 渡す。この関数は設定を引かない（settings-reference.md「設定を引くのは端だけである」）。
 * ルートのディレクトリ名と `config.yaml` は openspec が決めるものなので固定値で持つ。
 *
 * change はここでは作らない。初回呼び出しの `openspec-ff-change` スキルが
 * `openspec new change` から実行する（design.md 決定1・2）。
 *
 * 失敗は素の Error のまま呼び出し側へ届ける。
 */
export async function initSessionOpenspec(options: {
  cwd: string
  bin: string
  initArgs: string
  schemaName: string
}): Promise<void> {
  const { cwd, bin, initArgs, schemaName } = options
  await execFileAsync(bin, initArgs.split(/\s+/), { cwd })
  await writeFile(
    join(cwd, OPENSPEC_DIR, OPENSPEC_CONFIG_FILE),
    `schema: ${schemaName}\n`,
    'utf8',
  )
}
