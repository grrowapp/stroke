import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Invocation } from '#shared/stroke'
import { invokeAi, type AiRun } from '../../../../server/utils/stroke/ai'
import type { ClaudeLaunch } from '../../../../server/utils/stroke/claude'

/**
 * invokeAi は、組み立てに成功した後は設定を引かない（openspec/specs/agent/invocation）。
 * 見るのは、渡した起動定義・定型・cwd がそのまま使われること、完了を **output stream** で
 * 検知すること、`invocation` の遷移がすべて A8 を通ること、リトライ上限で `error`
 * （終端）に倒れること——ここまでは組み立て済みの `AiRun` を渡す従来どおりの経路
 * （`runInvoke` ヘルパー）。
 *
 * 組み立てに失敗する経路（fix-idle-stuck-on-run-build-failure）は別の `describe`
 * に分けた。`build` に同期的に throw する関数を渡し、`invokeAi` 自身が
 * `failed`/`error` を書き分けることを見る——`buildRun` の実装（`readStrokeConfig()` が
 * throw する等の具体的な原因）は `invoke.test.ts` の責務で、ここでは当てない
 * （design.md D5「テストも構造に当てる」）。
 */

const { runClaude } = vi.hoisted(() => ({ runClaude: vi.fn() }))

vi.mock('../../../../server/utils/stroke/claude', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./claude')>()),
  runClaude,
}))

/** `readStrokeConfig` を組み立て失敗の経路だけで使う細工。maxRetries の読み出しを制御する */
const strokeConfig = vi.hoisted(() => ({ maxRetries: 2, broken: false }))

vi.mock('../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => {
    if (strokeConfig.broken) throw new Error('設定を読めない')
    return { claude: { maxRetries: strokeConfig.maxRetries } }
  },
}))

/** 組み立て失敗の経路が書く A8（`$fetch`）。他の vi.hoisted の細工と同じ形で持つ。 */
const $fetch = vi.hoisted(() => vi.fn())

vi.mock('#build/fetch.mjs', () => ({ $fetch }))

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

/** 組み立てに成功した従来経路。`build` は常に成功して `run` を返す。 */
async function runInvoke(run: AiRun): Promise<void> {
  const { settled } = invokeAi(SESSION_ID, run.retries, () => run)
  await settled
}

describe('invokeAi', () => {
  beforeEach(() => {
    runClaude.mockReset()
  })

  it('渡した起動定義・定型・cwd をそのまま runClaude へ渡す', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'abc' })

    const { run } = makeRun({ conversationId: 'fixed-id' })
    await runInvoke(run)

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
    await runInvoke(run)

    expect(runClaude).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 90000 }))
  })

  it('起こし直した回数のぶんだけ刻みを足した長さで起動する', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'abc' })

    const { run } = makeRun({ retries: 1, timeoutMs: 90000, timeoutStepMs: 30000 })
    await runInvoke(run)
    expect(runClaude).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 120000 }))

    runClaude.mockClear()

    const { run: run2 } = makeRun({ retries: 2, timeoutMs: 90000, timeoutStepMs: 30000 })
    await runInvoke(run2)
    expect(runClaude).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 150000 }))
  })

  it('刻みが 0 なら回数によらず基準の長さで起動する', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'abc' })

    const { run } = makeRun({ retries: 2, maxRetries: 5, timeoutMs: 90000, timeoutStepMs: 0 })
    await runInvoke(run)

    expect(runClaude).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 90000 }))
  })

  it('続き先が在れば継続として、続きを促す定型で起動する', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'abc' })

    const { run } = makeRun({ hasConversation: async () => true, conversationId: 'abc' })
    await runInvoke(run)

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'CONTINUE', mode: 'resume', sessionId: 'abc' }),
    )
  })

  it('会話 id を持たない用途では claude に採番させる', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'generated-by-claude' })

    const { run, remembered } = makeRun({ conversationId: undefined })
    await runInvoke(run)

    // `--session-id` も `--resume` も付けない
    expect(runClaude).toHaveBeenCalledWith(expect.objectContaining({ sessionId: undefined }))
    // 返ってきた id を覚え、次のキックの続き先にする
    expect(remembered).toEqual(['generated-by-claude'])
  })

  it('起動で running、output stream の成功で idle にする（回数は戻す）', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: null })

    const { run, calls } = makeRun({ retries: 1 })
    await runInvoke(run)

    expect(calls).toEqual([
      { invocation: 'running', retries: 2 },
      { invocation: 'idle', retries: 0 },
    ])
  })

  it('`didWork` を渡さない用途では、プロセスの成功だけで idle にする', async () => {
    // 今はどの用途も didWork を渡すが、渡さない呼び出し元のための既定（安全弁）は残る
    runClaude.mockResolvedValue({ ok: true, sessionId: 'x' })

    const { run, calls } = makeRun({ didWork: undefined })
    await runInvoke(run)

    expect(calls.at(-1)).toEqual({ invocation: 'idle', retries: 0 })
  })

  it('プロセスは成功したが作業をしていなければ failed にする', async () => {
    // ai.ts は kind を知らず、渡された `didWork` の真偽値しか見ない。ストロークは
    // 必ず提出（A5・A7）で終わるので提出が無ければ作業をしていない（invoke.ts の
    // submittedSince）。steering は steering 文書の提出が代行先に受理されたかを
    // 起動単位の記録で見る（invoke.ts の submittedByLaunch。
    // fix-steering-empty-completion）。どちらも呼び出し側が渡す関数が false を返せば
    // ここは同じく failed になる——この既存のケースは工程を問わず成立する（tasks 4.6）
    runClaude.mockResolvedValue({ ok: true, sessionId: 'x' })

    const { run, calls } = makeRun({ didWork: () => false })
    await runInvoke(run)

    expect(calls.at(-1)).toEqual({ invocation: 'failed', retries: undefined })
  })

  /**
   * 完成の記録（add-activated-phase design D4）。`didWork` と同じ置き方で、渡されていて
   * **かつ作業があったとき**だけ呼ぶ。ai.ts は phase を知らず、渡された関数の真偽値しか
   * 見ない。
   *
   * **`didWork` を先に見る。** 完成したかを決めるのは `didWork`（その起動で steering 文書の
   * 提出が本家に受理されたか）で、記録先の U15 は判定を持たない（ADR-0014）。記録の受理を
   * 完成の判定に代える形は 2026-09-04 に退けた——U15 が承認依頼を数えていた時の理屈である。
   */
  describe('完成の記録（recordCompletion）', () => {
    it('作業ありで記録が受理されれば idle（回数は戻す）', async () => {
      runClaude.mockResolvedValue({ ok: true, sessionId: 'x' })
      const recordCompletion = vi.fn(async () => true)

      const { run, calls } = makeRun({ didWork: () => true, recordCompletion })
      await runInvoke(run)

      expect(recordCompletion).toHaveBeenCalledTimes(1)
      expect(calls.at(-1)).toEqual({ invocation: 'idle', retries: 0 })
    })

    it('作業ありでも記録が受理されなければ failed（巡回が起こし直す）', async () => {
      runClaude.mockResolvedValue({ ok: true, sessionId: 'x' })

      const { run, calls } = makeRun({ didWork: () => true, recordCompletion: async () => false })
      await runInvoke(run)

      expect(calls.at(-1)).toEqual({ invocation: 'failed', retries: undefined })
    })

    it('渡されていなければ記録を試みず idle（ストローク・完成済みの steering）', async () => {
      runClaude.mockResolvedValue({ ok: true, sessionId: 'x' })

      const { run, calls } = makeRun({ didWork: () => true, recordCompletion: undefined })
      await runInvoke(run)

      expect(calls.at(-1)).toEqual({ invocation: 'idle', retries: 0 })
    })

    it('作業が無ければ記録を試みず failed（判定は didWork が持つ）', async () => {
      // 提出が1つも受理されていない起動は完成ではない。ここで記録しに行くと、何も出して
      // いない対象が完成として畳まれる
      runClaude.mockResolvedValue({ ok: true, sessionId: 'x' })
      const recordCompletion = vi.fn(async () => true)

      const { run, calls } = makeRun({ didWork: () => false, recordCompletion })
      await runInvoke(run)

      expect(recordCompletion).not.toHaveBeenCalled()
      expect(calls.at(-1)).toEqual({ invocation: 'failed', retries: undefined })
    })

    it('プロセスが失敗したら記録を試みない', async () => {
      runClaude.mockResolvedValue({ ok: false, detail: 'timeout', sessionMissing: false })
      const recordCompletion = vi.fn(async () => true)

      const { run, calls } = makeRun({ recordCompletion })
      await runInvoke(run)

      expect(recordCompletion).not.toHaveBeenCalled()
      expect(calls.at(-1)).toEqual({ invocation: 'failed', retries: undefined })
    })
  })

  it('1回の呼び出しで起こすのは1回だけ（起こし直しは巡回が担う）', async () => {
    runClaude.mockResolvedValue({ ok: false, sessionMissing: false, detail: 'タイムアウト' })

    const { run } = makeRun({ retries: 0, maxRetries: 2 })
    await runInvoke(run)

    expect(runClaude).toHaveBeenCalledTimes(1)
  })

  it('上限と同じ回数までは起こす（総起動回数は上限 + 1）', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'x' })

    const { run, calls } = makeRun({ retries: 2, maxRetries: 2 })
    await runInvoke(run)

    expect(runClaude).toHaveBeenCalledTimes(1)
    expect(calls[0]).toEqual({ invocation: 'running', retries: 3 })
  })

  it('上限が 0 でも1回は起こす', async () => {
    runClaude.mockResolvedValue({ ok: true, sessionId: 'x' })

    const { run } = makeRun({ retries: 0, maxRetries: 0 })
    await runInvoke(run)

    expect(runClaude).toHaveBeenCalledTimes(1)
  })

  it('時間切れ・異常終了で尽きたら failed にする', async () => {
    runClaude.mockResolvedValue({ ok: false, sessionMissing: false, detail: 'タイムアウト' })

    const { run, calls } = makeRun()
    await runInvoke(run)

    expect(calls.at(-1)).toEqual({ invocation: 'failed', retries: undefined })
  })

  it('リトライ上限を超えていたら起動せず error（終端）にする', async () => {
    const { run, calls } = makeRun({ retries: 3, maxRetries: 2 })
    await runInvoke(run)

    expect(runClaude).not.toHaveBeenCalled()
    expect(calls).toEqual([{ invocation: 'error', retries: undefined }])
  })

  it('実行環境を整えられなければ起動せず failed にする', async () => {
    const { run, calls } = makeRun({
      prepare: async () => {
        throw new Error('openspec init に失敗')
      },
    })
    await runInvoke(run)

    expect(runClaude).not.toHaveBeenCalled()
    expect(calls.at(-1)).toEqual({ invocation: 'failed', retries: undefined })
  })

  it('継続の途中で会話を失ったら作り直さない', async () => {
    runClaude.mockResolvedValue({ ok: false, sessionMissing: true, detail: '会話が無い' })

    const { run } = makeRun({ hasConversation: async () => true, conversationId: 'gone' })
    await runInvoke(run)

    // 1回で打ち切る（新しい会話として送り直さない）
    expect(runClaude).toHaveBeenCalledTimes(1)
  })

  /**
   * `built` は組み立ての成否だけを表し、AI の応答の完了を待たない
   * （openspec/specs/api/session/invoke-agent）。ここでは `runClaude` を意図的に止めて、
   * `built` が resolve した後もプロセスが終わっていなければ `settled` はまだ resolve
   * していないことを確かめる——U13 が `built` だけを待ってよい根拠になる。
   */
  it('built は AI の応答の完了を待たずに resolve する', async () => {
    let finishClaude = (): void => {}
    runClaude.mockImplementationOnce(() => new Promise((resolve) => {
      finishClaude = () => resolve({ ok: true, sessionId: 'x' })
    }))

    const { run } = makeRun()
    const { built, settled } = invokeAi(SESSION_ID, run.retries, () => run)

    await built

    let settledResolved = false
    void settled.then(() => { settledResolved = true })
    // 1 マイクロタスクだけ回す。built が resolve しても settled はまだ先である
    await Promise.resolve()
    expect(settledResolved).toBe(false)

    finishClaude()
    await settled
    expect(settledResolved).toBe(true)
  })
})

/**
 * 組み立てに失敗した経路（fix-idle-stuck-on-run-build-failure）。`build` が同期的に
 * throw したとき、`invokeAi` が記録をどう書き分けるかだけを見る。`buildRun` の実装
 * （何が throw の原因か）は当てない——`invoke.test.ts` の責務（design.md D5）。
 */
describe('invokeAi の組み立て失敗', () => {
  const BUILD_ERROR = new Error('起動の材料を組み立てられない')
  const build = (): AiRun => { throw BUILD_ERROR }

  beforeEach(() => {
    strokeConfig.maxRetries = 2
    strokeConfig.broken = false
    $fetch.mockReset()
    $fetch.mockResolvedValue(undefined)
  })

  it('記録を1つも書かずに終わらない。built は組み立ての理由で reject する', async () => {
    const { built, settled } = invokeAi(SESSION_ID, 0, build)

    await expect(built).rejects.toBe(BUILD_ERROR)
    await settled

    // 巡回が拾える形（A8・submission）で必ず1回書かれている
    expect($fetch).toHaveBeenCalledTimes(1)
  })

  it('上限内なら failed とし、起こし直した回数を1つ進めて書く', async () => {
    const { settled } = invokeAi(SESSION_ID, 1, build)
    await settled

    expect($fetch).toHaveBeenCalledWith(
      `/api/strokes/${SESSION_ID}/submission`,
      { method: 'POST', body: { invocation: 'failed', retries: 2 } },
    )
  })

  it('settled は組み立てに失敗しても reject しない（記録を書き終えて resolve する）', async () => {
    const { settled } = invokeAi(SESSION_ID, 0, build)
    await expect(settled).resolves.toBeUndefined()
  })

  it('上限に達していれば error にする', async () => {
    strokeConfig.maxRetries = 2
    const { settled } = invokeAi(SESSION_ID, 3, build)
    await settled

    expect($fetch).toHaveBeenCalledWith(
      `/api/strokes/${SESSION_ID}/submission`,
      { method: 'POST', body: { invocation: 'error' } },
    )
  })

  it('上限そのものを読み出せなければ error にする', async () => {
    strokeConfig.broken = true
    // 上限内に収まるはずの回数でも、上限そのものが読めなければ error に倒す
    const { settled } = invokeAi(SESSION_ID, 0, build)
    await settled

    expect($fetch).toHaveBeenCalledWith(
      `/api/strokes/${SESSION_ID}/submission`,
      { method: 'POST', body: { invocation: 'error' } },
    )
  })
})
