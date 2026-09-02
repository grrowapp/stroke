import { describe, expect, it } from 'vitest'

import { listLiveProcesses, parsePsOutput } from '../../../../server/utils/stroke/live-processes'

/**
 * 走っているプロセスの一覧を取る口（`fix-orphan-run-on-restart` tasks 1.1）。
 *
 * 見るのは、`ps -o pid=,args=` の生の出力を pid と argv に分けられること（純粋な
 * パース）と、取れない環境では例外を投げず `null` に倒れること（呼び出し側を止めない）。
 */

describe('parsePsOutput', () => {
  it('pid と argv に分ける', () => {
    const stdout = '  123 node script.js --foo bar\n 456 /usr/bin/ps -ww -e -o pid=,args=\n'
    expect(parsePsOutput(stdout)).toEqual([
      { pid: 123, argv: 'node script.js --foo bar' },
      { pid: 456, argv: '/usr/bin/ps -ww -e -o pid=,args=' },
    ])
  })

  it('空行を無視する', () => {
    expect(parsePsOutput('\n\n   \n')).toEqual([])
  })

  it('pid の形をしていない行は無視する（見出し行などを拾わない）', () => {
    expect(parsePsOutput('  PID ARGS\nnot-a-pid something\n')).toEqual([])
  })

  it('argv に含まれる空白は1つの塊としてそのまま持つ（照合側が部分文字列で探すため）', () => {
    expect(parsePsOutput('99 claude -p --session-id abc --mcp-config {"a":1}\n')).toEqual([
      { pid: 99, argv: 'claude -p --session-id abc --mcp-config {"a":1}' },
    ])
  })
})

describe('listLiveProcesses', () => {
  it('実際に走っているプロセス（このテストプロセス自身）を一覧に含む', async () => {
    const processes = await listLiveProcesses()
    expect(processes).not.toBeNull()
    expect(processes!.some(p => p.pid === process.pid)).toBe(true)
  })

  it('`ps` を解決できない環境では null を返す（例外で呼び出し側を止めない）', async () => {
    const originalPath = process.env.PATH
    process.env.PATH = ''
    try {
      await expect(listLiveProcesses()).resolves.toBeNull()
    } finally {
      process.env.PATH = originalPath
    }
  })
})
