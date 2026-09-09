import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, toValue, watch } from 'vue'

/**
 * 呼び出し側が 409 をどう扱うか、そして**どの path へ送っているか**。
 *
 * **helper の戻り値だけを見ても足りない。** 409 の扱いの不具合の発生源は「同じ扱いが3箇所に
 * 散り、1箇所だけ直されて残りが取り残された」ことである。`error` に文言を入れないことは
 * 呼び出し側の責任なので、そこを見ないと同型の再発を検出できない。
 *
 * **path も見る。** この composable は `base` を `/api/${sessionId}` と組み立てており、
 * セッションの名前空間そのものを落として回答の送信も起動要求も 404 にしていた
 * （change `fix-session-api-namespace`。旧 ticket `fix-agent-question-api-path`）。
 * `url.includes('/invoke-agent')` のような部分一致では、基底が誤っていても通ってしまう。
 * 実際に渡された URL を全文で突き合わせる。
 */

const { fetchMock } = vi.hoisted(() => {
  const fn = vi.fn() as ReturnType<typeof vi.fn> & { create: () => unknown }
  fn.create = () => fn
  return { fetchMock: fn }
})
vi.mock('ofetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ofetch')>()),
  $fetch: fetchMock,
}))

// 自動 import は実体のファイルへ解決されるので、global の差し替えでは効かない。
// W1 の購読はモジュールごと差し替える
// **本物の ref を入れる。** 素のオブジェクトだと `watch` が反応せず、次の問いが届いても
// 決着が走らない（待機が終わらない）
const { holder } = vi.hoisted(() => ({ holder: { current: null as unknown } }))
vi.mock('../../../app/composables/useSessionChannel', () => ({
  useSessionChannel: () => holder.current,
}))

function httpError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode })
}

const QUESTION = {
  header: '保存の方式',
  detail: 'ここまでに決まったこと',
  question: '保存方式をどうするか',
  options: [{ label: '同期で書く', description: '書き終わるまで待つ' }],
}

beforeEach(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('toValue', toValue)
  fetchMock.mockReset()
  holder.current = ref<unknown>({ ...QUESTION })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAgentQuestion.send', () => {
  it('409 では失敗を示さず、待機に入る', async () => {
    const { useWaitingRetry } = await import('../../../app/composables/useWaitingRetry')
    vi.stubGlobal('useWaitingRetry', useWaitingRetry)
    const { useAgentQuestion } = await import('../../../app/composables/useAgentQuestion')

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/invoke-agent')) throw httpError(409)
      return null
    })

    const q = useAgentQuestion('session-1')
    await q.send({ kind: 'option', value: '同期で書く' })
    await nextTick()

    // `error` は空のまま（`specs/agent-question`「失敗を示してはならない」）
    expect(q.error.value).toBeNull()
    expect(q.waiting.value).toBe(true)
    // 受理は通っているので数えは進む
    expect(q.answered.value).toBe(1)
  })

  it('待っている間に次の問いが届いたら、待機が終わり前の問いを抱えたままにしない', async () => {
    // `specs/agent-question`「待っている間に次が返る」。**同じ問いを抱えたままにすると、
    // ユーザーは二度答えることになり、`strokes.json` に回答が重複して記録される**
    const { useWaitingRetry } = await import('../../../app/composables/useWaitingRetry')
    vi.stubGlobal('useWaitingRetry', useWaitingRetry)
    const { useAgentQuestion } = await import('../../../app/composables/useAgentQuestion')

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/invoke-agent')) throw httpError(409)
      return null
    })

    const q = useAgentQuestion('session-1')
    const first = q.question.value
    await q.send({ kind: 'option', value: '同期で書く' })
    expect(q.waiting.value).toBe(true)

    // W1 が次の1問を配信する
    ;(holder.current as { value: unknown }).value = { ...QUESTION, question: '次はどうするか' }
    await nextTick()

    // 待機は終わり、画面が抱えるのは**新しいほうの問い**である
    expect(q.waiting.value).toBe(false)
    expect(q.question.value).not.toBe(first)
    expect((q.question.value as { question: string }).question).toBe('次はどうするか')
    expect(q.error.value).toBeNull()
  })

  it('409 以外の起動失敗は、これまでどおり失敗として示す', async () => {
    const { useWaitingRetry } = await import('../../../app/composables/useWaitingRetry')
    vi.stubGlobal('useWaitingRetry', useWaitingRetry)
    const { useAgentQuestion } = await import('../../../app/composables/useAgentQuestion')

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/invoke-agent')) throw httpError(500)
      return null
    })

    const q = useAgentQuestion('session-1')
    await q.send({ kind: 'option', value: '同期で書く' })

    expect(q.error.value?.title).toBe('AI を起動できませんでした')
    expect(q.waiting.value).toBe(false)
  })
})

describe('useAgentQuestion.send の送り先', () => {
  /**
   * `send` が成功すると `useWaitingRetry` が3秒間隔のポーリングを張る。張ったまま抜けると、
   * この後のテストの最中に U2 を読みに行き、`$fetch` のモックが返す `null` から
   * `invocation` を取ろうとして落ちる（`useWaitingRetry.ts` の poll）。
   * `useAgentQuestion` は `stopWaiting` を返さないので、`useWaitingRetry` を包んで
   * 中の1つを捕まえておき、テストごとに止める（`useWaitingRetry.test.ts` が
   * `stopWaiting()` を呼んでいるのと同じ理由）。
   */
  let stopWaiting: (() => void) | undefined

  async function stubWaitingRetry(): Promise<void> {
    const { useWaitingRetry } = await import('../../../app/composables/useWaitingRetry')
    vi.stubGlobal('useWaitingRetry', (sessionId: string) => {
      const w = useWaitingRetry(sessionId)
      stopWaiting = w.stopWaiting
      return w
    })
  }

  afterEach(() => {
    stopWaiting?.()
    stopWaiting = undefined
  })

  it('回答は U7 `/api/sessions/<id>/answer` へ送る', async () => {
    await stubWaitingRetry()
    const { useAgentQuestion } = await import('../../../app/composables/useAgentQuestion')

    fetchMock.mockResolvedValue(null)

    const q = useAgentQuestion('session-1')
    await q.send({ kind: 'option', value: '同期で書く' })

    // 1回目の呼び出しが受理（U7）。基底が `/api/<id>` に戻れば 404 になる path なので、
    // 全文で突き合わせる
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/sessions/session-1/answer')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
  })

  it('受理の直後の起動要求は U13 `/api/sessions/<id>/invoke-agent` へ出す', async () => {
    await stubWaitingRetry()
    const { useAgentQuestion } = await import('../../../app/composables/useAgentQuestion')

    fetchMock.mockResolvedValue(null)

    const q = useAgentQuestion('session-1')
    await q.send({ kind: 'option', value: '同期で書く' })

    // 受理（U7）と起動（U13）は分かれている（`specs/api/answer`）ので、この順で2回叩く。
    // **件数を固定しない。** 待機に入ると `useWaitingRetry` の3秒ポーリングが動きだすので、
    // 実時間に依存した件数を期待すると将来間隔が縮んだときに落ちる
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/sessions/session-1/invoke-agent')
  })
})
