import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Invocation } from '#shared/stroke'
import { invokeAi, type AiRun } from '../../../../server/utils/stroke/ai'
import type { ClaudeLaunch } from '../../../../server/utils/stroke/claude'

/**
 * invokeAi は設定を引かない（openspec/specs/agent/invocation）。見るのは、
 * 渡した起動定義・定型・cwd がそのまま使われること、完了を **output stream** で
 * 検知すること、`invocation` の遷移がすべて `setInvocation`（A8）を通ること、
 * リトライ上限で `error`（終端）に倒れること。
 */

const { runClaude } = vi.hoisted(() => ({ runClaude: vi.fn() }))

vi.mock('../../../../server/utils/stroke/claude', async (importOriginal) => ({
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
    // **本番の既定値を置かない。** 見るのは「渡した値がそのまま素通しされるか」なので、
    // 既定と同じ値を使うと、実装が設定を無視して既定へ戻っても気付けない
    timeoutMs: 60000,
    timeoutStepMs: 0,
    hasConversation: async () => false,
    setInvocation: async (invocation, retries) => {
      calls.push({ invocation, retries })
    },
    didWork: () => true,
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
      timeoutMs: 60000,
    })
  })

  it('起こし直していない起動には刻みを乗せない', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'abc' })

    // `retries` は「これまでに起こし直した回数」。初回のキックは 0 なので基準の長さそのもの
    const { run } = makeRun({ retries: 0, timeoutMs: 90000, timeoutStepMs: 30000 })
    await invokeAi(SESSION_ID, run)

    expect(runClaude).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 90000 }))
  })

  it('起こし直した回数のぶんだけ刻みを足した長さで起動する', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'abc' })

    const { run } = makeRun({ retries: 1, timeoutMs: 90000, timeoutStepMs: 30000 })
    await invokeAi(SESSION_ID, run)
    expect(runClaude).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 120000 }))

    runClaude.mockClear()

    const { run: run2 } = makeRun({ retries: 2, timeoutMs: 90000, timeoutStepMs: 30000 })
    await invokeAi(SESSION_ID, run2)
    expect(runClaude).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 150000 }))
  })

  it('刻みが 0 なら回数によらず基準の長さで起動する', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'abc' })

    const { run } = makeRun({ retries: 2, maxRetries: 5, timeoutMs: 90000, timeoutStepMs: 0 })
    await invokeAi(SESSION_ID, run)

    expect(runClaude).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 90000 }))
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

  it('提出を要らない用途では、プロセスの成功だけで idle にする', async () => {
    // steering は endpoint へ何も提出しない。`didWork` を渡さないので成功として扱う
    runClaude.mockResolvedValue({ ok: true, sessionId: 'x' })

    const { run, calls } = makeRun({ didWork: undefined })
    await invokeAi(SESSION_ID, run)

    expect(calls.at(-1)).toEqual({ invocation: 'idle', retries: 0 })
  })

  it('プロセスは成功したが作業をしていなければ failed にする', async () => {
    // ストロークは必ず提出（A5・A7）で終わる。提出が無いのは何もせず終わったということ
    runClaude.mockResolvedValue({ ok: true, sessionId: 'x' })

    const { run, calls } = makeRun({ didWork: () => false })
    await invokeAi(SESSION_ID, run)

    expect(calls.at(-1)).toEqual({ invocation: 'failed', retries: undefined })
  })

  it('1回の呼び出しで起こすのは1回だけ（起こし直しは巡回が担う）', async () => {
    runClaude.mockResolvedValue({ ok: false, sessionMissing: false, detail: 'タイムアウト' })

    const { run } = makeRun({ retries: 0, maxRetries: 2 })
    await invokeAi(SESSION_ID, run)

    expect(runClaude).toHaveBeenCalledTimes(1)
  })

  it('上限と同じ回数までは起こす（総起動回数は上限 + 1）', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'x' })

    const { run, calls } = makeRun({ retries: 2, maxRetries: 2 })
    await invokeAi(SESSION_ID, run)

    expect(runClaude).toHaveBeenCalledTimes(1)
    expect(calls[0]).toEqual({ invocation: 'running', retries: 3 })
  })

  it('上限が 0 でも1回は起こす', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'x' })

    const { run } = makeRun({ retries: 0, maxRetries: 0 })
    await invokeAi(SESSION_ID, run)

    expect(runClaude).toHaveBeenCalledTimes(1)
  })

  it('時間切れ・異常終了で尽きたら failed にする', async () => {
    runClaude.mockResolvedValue({ ok: false, sessionMissing: false, detail: 'タイムアウト' })

    const { run, calls } = makeRun()
    await invokeAi(SESSION_ID, run)

    expect(calls.at(-1)).toEqual({ invocation: 'failed', retries: undefined })
  })

  it('リトライ上限を超えていたら起動せず error（終端）にする', async () => {
    const { run, calls } = makeRun({ retries: 3, maxRetries: 2 })
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
