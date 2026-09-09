import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, toValue } from 'vue'

// Nuxt の自動 import は `$fetch` を `ofetch` へ解決する。global を差し替えても効かないので、
// モジュールごと差し替える
const { fetchMock } = vi.hoisted(() => {
  const fn = vi.fn() as ReturnType<typeof vi.fn> & { create: () => unknown }
  // Nuxt の `fetch.mjs` は import 時に `$fetch.create(...)` を呼び、その戻りをアプリの
  // `$fetch` にする。同じものを返せば、こちらのモックがそのまま使われる
  fn.create = () => fn
  return { fetchMock: fn }
})
vi.mock('ofetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ofetch')>()),
  $fetch: fetchMock,
}))

import { useWaitingRetry } from '../../../app/composables/useWaitingRetry'

/**
 * 起動要求と待機（`requestRun`）。
 *
 * 見るのは **409 で待機に入ること**である。409 は「前の claude がまだ走っている」で、
 * 契約どおりの正常な結果（`docs/specs/api/contract.md`）。走っている claude が回答を拾って
 * 次の問いを出すので、画面は待機に入るのが正しい。
 *
 * **表示だけを直しても足りない。** 待機に入らないと、答え終わった問いを手放す決着
 * （`useAgentQuestion` の watch）が走らず、同じ問いが画面に残り続ける。ユーザーは二度
 * 答えるしかなくなり、`strokes.json` に回答が重複して記録される（実測: 「実行環境」×3）。
 */

const SESSION = 'session-1'

/** ofetch の FetchError の形。判別に使うのは `statusCode` だけ */
function httpError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode })
}

// `useWaitingRetry` は Nuxt の自動 import（`ref` / `toValue` / `$fetch`）に載っている。
// nuxt 環境を立てると setup が10秒で時間切れになるので、既定の node 環境のまま、
// 使っている口だけを差し込む。`useIntervalFn` はモジュールが明示的に import している
beforeEach(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('toValue', toValue)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestRun', () => {
  it('起動を要求できたら待機に入る', async () => {
    fetchMock.mockResolvedValue(null)

    const w = useWaitingRetry(SESSION)
    const result = await w.requestRun()

    expect(result).toEqual({ ok: true })
    expect(w.waiting.value).toBe(true)
    w.stopWaiting()
  })

  it('409（前の応答をまだ待っている）でも待機に入る', async () => {
    fetchMock.mockRejectedValue(httpError(409))

    const w = useWaitingRetry(SESSION)
    const result = await w.requestRun()

    // ここが立たないと、問いを手放す決着が走らず同じ問いに二度答えさせる
    expect(w.waiting.value).toBe(true)
    w.stopWaiting()
  })

  it('409 は失敗として返らない', async () => {
    fetchMock.mockRejectedValue(httpError(409))

    const w = useWaitingRetry(SESSION)
    const result = await w.requestRun()

    // 呼び出し側が失敗を示す材料を受け取らない（specs/agent-question の MUST NOT）
    expect(result).toEqual({ ok: true })
    expect(w.failed.value).toBe(false)
    expect(w.errored.value).toBe(false)
    w.stopWaiting()
  })

  it('409 以外の失敗では待機に入らず、理由を返す', async () => {
    const error = httpError(500)
    fetchMock.mockRejectedValue(error)

    const w = useWaitingRetry(SESSION)
    const result = await w.requestRun()

    expect(result).toEqual({ ok: false, error })
    expect(w.waiting.value).toBe(false)
  })

  it('busy が解けたら、出せなかった起動要求を出し直す', async () => {
    // **これがこの change の核心である。** 1回の `invoke-agent` = 1回の claude 実行で、
    // 続きは次の起動でしか進まない。巡回は `failed` しか拾わず、受理の口は起動を含まない。
    // 409 で要求を捨てると、走っていた claude が終わって `idle` になった後、誰も次を
    // 起こさない（実測 2026-08-28: 回答は記録されたのに `idle` のまま4分待って落ちた）
    vi.useFakeTimers()

    const calls: string[] = []
    fetchMock.mockImplementation(async (url: string) => {
      calls.push(url)
      if (url.includes('/invoke-agent')) {
        // 1回目は busy、出し直した2回目は通る
        if (calls.filter(c => c.includes('/invoke-agent')).length === 1) throw httpError(409)
        return null
      }
      // 状態の読み直し: busy を出していた実行が終わった
      return { invocation: 'idle' }
    })

    const w = useWaitingRetry(SESSION)
    await w.requestRun('/opt/projects/session-1')
    expect(w.waiting.value).toBe(true)

    // 巡回が `idle` を観測する
    await vi.advanceTimersByTimeAsync(3_000)
    await vi.waitFor(() =>
      expect(calls.filter(c => c.includes('/invoke-agent'))).toHaveLength(2))

    // 出し直したので、まだ待っている（`idle` を見て降りてしまわない）
    expect(w.waiting.value).toBe(true)
    w.stopWaiting()
  })

  it('出し直しは無限には続かない', async () => {
    vi.useFakeTimers()

    const invokes: string[] = []
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/invoke-agent')) {
        invokes.push(url)
        throw httpError(409)
      }
      return { invocation: 'idle' }
    })

    const w = useWaitingRetry(SESSION)
    await w.requestRun()

    // 何度 `idle` を観測しても、上限を超えて出し直さない
    for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(3_000)

    expect(invokes.length).toBeLessThanOrEqual(5)
    expect(w.waiting.value).toBe(false)
  })

  it('cwd を渡したときだけ query に載せる', async () => {
    fetchMock.mockResolvedValue(null)

    const w = useWaitingRetry(SESSION)
    await w.requestRun('/opt/projects/session-1')
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/strokes/${SESSION}/invoke-agent`,
      { query: { cwd: '/opt/projects/session-1' } },
    )
    w.stopWaiting()

    await w.requestRun()
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/strokes/${SESSION}/invoke-agent`, {})
    w.stopWaiting()
  })
})
