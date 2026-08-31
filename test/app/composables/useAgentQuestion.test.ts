import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, toValue, watch } from 'vue'

/**
 * 呼び出し側が 409 をどう扱うか。
 *
 * **helper の戻り値だけを見ても足りない。** この不具合の発生源は「同じ扱いが3箇所に散り、
 * 1箇所だけ直されて残りが取り残された」ことである。器（`error`）に文言を入れないことは
 * 呼び出し側の責任なので、そこを見ないと同型の再発を検出できない。
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

    // 器は空のまま（`specs/agent-question`「失敗を示してはならない」）
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
