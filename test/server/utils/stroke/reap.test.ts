import { spawn, type ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

import type { Invocation, SessionSummary } from '#shared/stroke'
import { listLiveProcesses, type LiveProcess } from '../../../../server/utils/stroke/live-processes'
import { reapRunning, terminateProcess, type ReapDeps } from '../../../../server/utils/stroke/reap'

/**
 * 起動時の後始末（openspec/specs/bootstrap/system/cleanup-agent-process）。
 *
 * 「生きている claude を止めてから失敗にする」だけは、実際にプロセスを起こして
 * `ps` で見つけ `SIGKILL` で終わらせるところまでを本物で確かめる——`claude` そのものは
 * 一度も起動しない（`node` を代わりに使う。`claude.test.ts` と同じ手口）。ユーザー指示
 * 「実際に kill するのはテストの中だけ」に沿う。他の分岐（プロセスが無い／判定できない）は、
 * 後始末の判断そのものを見るのが目的なので `ReapDeps` を差し替える。
 *
 * **どのサーバーインスタンスが起こしたかは見ない。** その前提を置かないことを決めている
 * （proposal「この change で扱わないもの」）ので、ポート違いを見分けるテストも持たない。
 */

const SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function mcpConfig(): string {
  return JSON.stringify({ mcpServers: { 'stroke-board': { type: 'http', url: 'http://example.test:3599/mcp', headers: {} } } })
}

function strokeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: SESSION_ID,
    phase: 'stroking',
    updatedAt: '2026-09-01T00:00:00.000Z',
    path: '/tmp/share/session',
    invocation: 'running',
    ...overrides,
  }
}

/** `writeInvocation` を差し替えて呼び出しを記録するだけの deps。個別のテストが上書きする。 */
function baseDeps(overrides: Partial<ReapDeps> = {}): { deps: ReapDeps, written: Array<{ sessionId: string, invocation: Invocation }> } {
  const written: Array<{ sessionId: string, invocation: Invocation }> = []
  const deps: ReapDeps = {
    listProcesses: async () => [],
    terminate: async () => true,
    writeInvocation: async (sessionId, invocation) => {
      written.push({ sessionId, invocation })
    },
    ...overrides,
  }
  return { deps, written }
}

describe('reapRunning: running でない対象・空の一覧', () => {
  it('running が1件も無ければ何もしない', async () => {
    const { deps, written } = baseDeps()
    const counts = await reapRunning([strokeSession({ invocation: 'idle' })], deps)

    expect(counts).toEqual({ killed: 0, failed: 0, errored: 0 })
    expect(written).toEqual([])
  })
})

describe('reapRunning: プロセスがもう無い', () => {
  it('対象に一致する claude がどこにも走っていなければ failed にする', async () => {
    const { deps, written } = baseDeps({ listProcesses: async () => [] })
    const counts = await reapRunning([strokeSession()], deps)

    expect(counts).toEqual({ killed: 0, failed: 1, errored: 0 })
    expect(written).toEqual([{ sessionId: SESSION_ID, invocation: 'failed' }])
  })
})

describe('reapRunning: 判定できない', () => {
  it('プロセス一覧を取れなければ error にする（failed にしない）', async () => {
    const { deps, written } = baseDeps({ listProcesses: async () => null })
    const counts = await reapRunning([strokeSession()], deps)

    expect(counts).toEqual({ killed: 0, failed: 0, errored: 1 })
    expect(written).toEqual([{ sessionId: SESSION_ID, invocation: 'error' }])
  })

  it('対象の種別を組み立てられなければ（phase が unknown）error にする', async () => {
    const { deps, written } = baseDeps({ listProcesses: async () => [] })
    const counts = await reapRunning([strokeSession({ phase: 'unknown' })], deps)

    expect(counts).toEqual({ killed: 0, failed: 0, errored: 1 })
    expect(written).toEqual([{ sessionId: SESSION_ID, invocation: 'error' }])
  })

  it('一致した自分の claude を終了させられなければ error にする（failed にしない）', async () => {
    const process0: LiveProcess = {
      pid: 424242,
      argv: `claude -p --session-id ${SESSION_ID} --mcp-config ${mcpConfig()}`,
    }
    const { deps, written } = baseDeps({
      listProcesses: async () => [process0],
      terminate: async () => false,
    })
    const counts = await reapRunning([strokeSession()], deps)

    expect(counts).toEqual({ killed: 0, failed: 0, errored: 1 })
    expect(written).toEqual([{ sessionId: SESSION_ID, invocation: 'error' }])
  })
})

describe('reapRunning: 複数件をまとめて数える', () => {
  it('3つの分岐が混ざっていても、それぞれ正しく数えて書く', async () => {
    const alive: LiveProcess = {
      pid: 1,
      argv: `claude -p --session-id alive-id --mcp-config ${mcpConfig()}`,
    }
    const stubborn: LiveProcess = {
      pid: 2,
      argv: `claude -p --session-id stubborn-id --mcp-config ${mcpConfig()}`,
    }
    const { deps, written } = baseDeps({
      listProcesses: async () => [alive, stubborn],
      terminate: async pid => pid === 1,
    })

    const counts = await reapRunning([
      strokeSession({ id: 'alive-id' }), // 走っている → 止めて failed
      strokeSession({ id: 'stubborn-id' }), // 走っているが止められない → error
      strokeSession({ id: 'gone-id' }), // 一致するプロセスが無い → failed
    ], deps)

    expect(counts).toEqual({ killed: 1, failed: 2, errored: 1 })
    // 書く順は sessions の並び順のまま
    expect(written).toEqual([
      { sessionId: 'alive-id', invocation: 'failed' },
      { sessionId: 'stubborn-id', invocation: 'error' },
      { sessionId: 'gone-id', invocation: 'failed' },
    ])
  })
})

/**
 * 走っている claude を実際に起こして見つけ、`SIGKILL` で止めてから
 * `failed` にする。`claude` の代わりに `node` を使うだけで、プロセスの発見・照合・終了・
 * 終了の確認はすべて本物の実装（`listLiveProcesses` / `terminateProcess`）を通す。
 */
describe('reapRunning: 実際に走っている claude を止める', () => {
  const spawned: ChildProcess[] = []

  afterEach(() => {
    // 後片付け。テストが失敗して `terminateProcess` まで届かなくても、確実に掃除する
    for (const child of spawned.splice(0)) {
      if (child.pid === undefined) continue
      try {
        process.kill(child.pid, 'SIGKILL')
      } catch {
        // すでに居なければ何もしなくてよい
      }
    }
  })

  function spawnFakeClaude(argv: string[]): ChildProcess {
    // `--` で node 自身のオプション解釈を打ち切り、以降を位置引数（process.argv）として渡す
    // （`claude.test.ts` と同じ手口）。何も出さずに居座るので、`terminateProcess` が
    // 実際に `SIGKILL` を送らないと終わらない。
    const child = spawn('node', ['-e', 'setTimeout(() => {}, 30000)', '--', ...argv], { stdio: 'ignore' })
    spawned.push(child)
    return child
  }

  async function waitUntilVisible(pid: number): Promise<void> {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const processes = await listLiveProcesses()
      if (processes?.some(p => p.pid === pid)) return
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw new Error(`pid ${pid} が ps の一覧に現れない`)
  }

  it('自分が起こした claude が走っていたら、終了させてから failed にする', async () => {
    const argv = ['--session-id', SESSION_ID, '--mcp-config', mcpConfig()]
    const child = spawnFakeClaude(argv)
    expect(child.pid).toBeDefined()
    await waitUntilVisible(child.pid!)

    const written: Array<{ sessionId: string, invocation: Invocation }> = []
    const counts = await reapRunning([strokeSession()], {
      listProcesses: listLiveProcesses,
      terminate: terminateProcess,
      writeInvocation: async (sessionId, invocation) => { written.push({ sessionId, invocation }) },
    })

    expect(counts).toEqual({ killed: 1, failed: 1, errored: 0 })
    expect(written).toEqual([{ sessionId: SESSION_ID, invocation: 'failed' }])

    // 実際に終了している（再度一覧を取っても現れない）
    const after = await listLiveProcesses()
    expect(after?.some(p => p.pid === child.pid)).toBe(false)
  })

  it('会話は失われない（実測: SIGKILL で止めても --resume で続けられるという既存の確認と同じ前提。ここでは終了そのものだけを見る）', async () => {
    const argv = ['--resume', SESSION_ID, '--mcp-config', mcpConfig()]
    const child = spawnFakeClaude(argv)
    await waitUntilVisible(child.pid!)

    const terminated = await terminateProcess(child.pid!)
    expect(terminated).toBe(true)

    const after = await listLiveProcesses()
    expect(after?.some(p => p.pid === child.pid)).toBe(false)
  })
})

describe('terminateProcess', () => {
  it('すでに居ないプロセスは、終了したのと同じ扱いにする', async () => {
    // 実在しない pid（テスト実行中に取られている可能性が無視できるほど大きい値）
    const NEVER_A_REAL_PID = 2 ** 30
    await expect(terminateProcess(NEVER_A_REAL_PID)).resolves.toBe(true)
  })
})
