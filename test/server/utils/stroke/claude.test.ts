import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runClaude, type ClaudeLaunch } from '../../../../server/utils/stroke/claude'

/**
 * デバッグログ（openspec/specs/debug/logging）。見るのは、出力先を渡したときだけ
 * 生出力がファイルに残ること、呼び出しごとに1ファイルで上書きされないこと、
 * 失敗した呼び出しでも残ること、書けなくても呼び出しの結果が変わらないこと。
 *
 * claude の代わりに `node -e` で子プロセスを立てる。`runClaude` が足すフラグ
 * （`-p` 以降）は `-e` のスクリプトへの位置引数として渡り、無視される。
 */

const SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

/** 成功エンベロープを stdout に出して 0 で終わる子プロセス。 */
const ENVELOPE = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  session_id: SESSION_ID,
  result: 'answer',
})

function launchThat(script: string): ClaudeLaunch {
  return {
    command: 'node',
    // 末尾の `--` で node 自身のオプション解釈を打ち切る。runClaude が足す `-p` 以降は
    // スクリプトへの位置引数になる
    args: ['-e', script, '--'],
    apiBaseUrl: 'http://example.test:9999',
  }
}

const SUCCESS_LAUNCH = launchThat(`process.stdout.write(${JSON.stringify(ENVELOPE)})`)

/** 書き出しは呼び出しの完了と切り離されているので、現れるまで少し待つ。 */
async function waitForFiles(dir: string, count: number): Promise<string[]> {
  for (let i = 0; i < 50; i++) {
    const names = await readdir(dir).catch(() => [])
    if (names.length >= count) return names.sort()
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return (await readdir(dir).catch(() => [])).sort()
}

const cleanups: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'claude-debug-log-'))
  cleanups.push(dir)
  return dir
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(cleanups.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('runClaude のデバッグログ', () => {
  it('出力先を渡さなければ何も書かれない', async () => {
    const dir = await tempDir()

    const result = await runClaude({
      sessionId: SESSION_ID,
      launch: SUCCESS_LAUNCH,
      cwd: dir,
      prompt: 'PROMPT',
      mode: 'new',
    })

    expect(result.ok).toBe(true)
    // 書き出しは非同期なので、少し置いてから「増えていない」を見る
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(await readdir(dir)).toEqual([])
  })

  it('出力先を渡せば呼び出しごとに1ファイル残り、上書きされない', async () => {
    const dir = await tempDir()
    const logDir = join(dir, 'logs')
    const options = {
      sessionId: SESSION_ID,
      launch: SUCCESS_LAUNCH,
      cwd: dir,
      prompt: 'PROMPT',
      mode: 'new' as const,
      debugLogDir: logDir,
    }

    expect((await runClaude(options)).ok).toBe(true)
    const first = await waitForFiles(logDir, 1)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatch(new RegExp(`^\\d{8}-\\d{6}-\\d{3}-${SESSION_ID}\\.json$`))
    expect(await readFile(join(logDir, first[0]!), 'utf8')).toBe(ENVELOPE)

    expect((await runClaude({ ...options, mode: 'resume' })).ok).toBe(true)
    const second = await waitForFiles(logDir, 2)
    expect(second).toHaveLength(2)
    expect(second).toContain(first[0])
    expect(await readFile(join(logDir, first[0]!), 'utf8')).toBe(ENVELOPE)
  })

  it('失敗した呼び出し（非ゼロ終了）でも出力が残る', async () => {
    const dir = await tempDir()
    const logDir = join(dir, 'logs')

    const result = await runClaude({
      sessionId: SESSION_ID,
      launch: launchThat('process.stdout.write("broken output"); process.exit(1)'),
      cwd: dir,
      prompt: 'PROMPT',
      mode: 'resume',
      debugLogDir: logDir,
    })

    expect(result.ok).toBe(false)
    const names = await waitForFiles(logDir, 1)
    expect(names).toHaveLength(1)
    expect(await readFile(join(logDir, names[0]!), 'utf8')).toBe('broken output')
  })

  it('出力先へ書けなくても呼び出しは成功のまま、警告が1行出る', async () => {
    const dir = await tempDir()
    // ディレクトリの座をファイルで塞ぎ、mkdir を失敗させる
    const blocked = join(dir, 'not-a-dir')
    await writeFile(blocked, 'occupied')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await runClaude({
      sessionId: SESSION_ID,
      launch: SUCCESS_LAUNCH,
      cwd: dir,
      prompt: 'PROMPT',
      mode: 'new',
      debugLogDir: blocked,
    })

    expect(result).toEqual({ ok: true, sessionId: SESSION_ID })
    for (let i = 0; i < 50 && warn.mock.calls.length === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]![0])).toContain('デバッグログを書けない')
    expect(await readFile(blocked, 'utf8')).toBe('occupied')
  })
})
