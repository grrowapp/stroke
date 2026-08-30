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
const { channel } = vi.hoisted(() => ({ channel: { value: null as unknown } }))
vi.mock('../../../app/composables/useSessionChannel', () => ({
  useSessionChannel: () => channel,
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
  channel.value = { ...QUESTION }
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
