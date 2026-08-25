import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Invocation } from '#shared/stroke'
import { invokeAi, type AiRun } from './ai'
import type { ClaudeLaunch } from './claude'

/**
 * invokeAi は設定を引かない（openspec/specs/agent/invocation）。見るのは、
 * 渡した起動定義・定型・cwd がそのまま使われること、完了を **output stream** で
 * 検知すること、`invocation` の遷移がすべて `setInvocation`（A8）を通ること、
 * リトライ上限で `error`（終端）に倒れること。
 */

const { runClaude } = vi.hoisted(() => ({ runClaude: vi.fn() }))

vi.mock('./claude', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./claude')>()),
  runClaude,
}))

const LAUNCH: ClaudeLaunch = {
  command: 'my-claude',
  args: ['--setting-sources', 'project', '--mcp-config', '{"x":1}'],
  apiBaseUrl: 'http://example.test:9999',
}

const SESSION_ID = 'session-1'

function makeRun(overrides: Partial<AiRun> = {}): {
  run: AiRun
  calls: Array<{ invocation: Invocation, retries?: number }>
  remembered: string[]
} {
  const calls: Array<{ invocation: Invocation, retries?: number }> = []
  const remembered: string[] = []
  const run: AiRun = {
    launch: LAUNCH,
    cwd: '/opt/projects/my-project',
    prompts: { first: 'FIRST', continue: 'CONTINUE' },
    maxRetries: 2,
    retries: 0,
    hasConversation: async () => false,
    setInvocation: async (invocation, retries) => {
      calls.push({ invocation, retries })
    },
    remember: async (id) => {
      remembered.push(id)
    },
    ...overrides,
  }
  return { run, calls, remembered }
}

describe('invokeAi', () => {
  beforeEach(() => {
    runClaude.mockReset()
  })

  it('渡した起動定義・定型・cwd をそのまま runClaude へ渡す', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'abc' })

    const { run } = makeRun({ conversationId: 'fixed-id' })
    await invokeAi(SESSION_ID, run)

    expect(runClaude).toHaveBeenCalledWith({
      sessionId: 'fixed-id',
      launch: LAUNCH,
      cwd: '/opt/projects/my-project',
      prompt: 'FIRST',
      mode: 'new',
    })
  })

  it('続き先が在れば継続として、続きを促す定型で起動する', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'abc' })

    const { run } = makeRun({ hasConversation: async () => true, conversationId: 'abc' })
    await invokeAi(SESSION_ID, run)

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'CONTINUE', mode: 'resume', sessionId: 'abc' }),
    )
  })

  it('会話 id を持たない用途では claude に採番させる', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'generated-by-claude' })

    const { run, remembered } = makeRun({ conversationId: undefined })
    await invokeAi(SESSION_ID, run)

    // `--session-id` も `--resume` も付けない
    expect(runClaude).toHaveBeenCalledWith(expect.objectContaining({ sessionId: undefined }))
    // 返ってきた id を覚え、次のキックの続き先にする
    expect(remembered).toEqual(['generated-by-claude'])
  })

  it('起動で running、output stream の成功で idle にする（回数は戻す）', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: null })

    const { run, calls } = makeRun({ retries: 1 })
    await invokeAi(SESSION_ID, run)

    expect(calls).toEqual([
      { invocation: 'running', retries: 2 },
      { invocation: 'idle', retries: 0 },
    ])
  })

  it('完了の検知に提出を使わない（提出が無くてもプロセスの成功で idle）', async () => {
    // steering は endpoint へ何も提出しない。それでも完了として扱う
    runClaude.mockResolvedValue({ ok: true, sessionId: 'x' })

    const { run, calls } = makeRun()
    await invokeAi(SESSION_ID, run)

    expect(calls.at(-1)).toEqual({ invocation: 'idle', retries: 0 })
  })

  it('時間切れ・異常終了で尽きたら failed にする', async () => {
    runClaude.mockResolvedValue({ ok: false, sessionMissing: false, detail: 'タイムアウト' })

    const { run, calls } = makeRun()
    await invokeAi(SESSION_ID, run)

    expect(calls.at(-1)).toEqual({ invocation: 'failed', retries: undefined })
  })

  it('リトライ上限に達していたら起動せず error（終端）にする', async () => {
    const { run, calls } = makeRun({ retries: 2, maxRetries: 2 })
    await invokeAi(SESSION_ID, run)

    expect(runClaude).not.toHaveBeenCalled()
    expect(calls).toEqual([{ invocation: 'error', retries: undefined }])
  })

  it('実行環境を整えられなければ起動せず failed にする', async () => {
    const { run, calls } = makeRun({
      prepare: async () => {
        throw new Error('openspec init に失敗')
      },
    })
    await invokeAi(SESSION_ID, run)

    expect(runClaude).not.toHaveBeenCalled()
    expect(calls.at(-1)).toEqual({ invocation: 'failed', retries: undefined })
  })

  it('継続の途中で会話を失ったら作り直さない', async () => {
    runClaude.mockResolvedValue({ ok: false, sessionMissing: true, detail: '会話が無い' })

    const { run } = makeRun({ hasConversation: async () => true, conversationId: 'gone' })
    await invokeAi(SESSION_ID, run)

    // 1回で打ち切る（新しい会話として送り直さない）
    expect(runClaude).toHaveBeenCalledTimes(1)
  })
})
