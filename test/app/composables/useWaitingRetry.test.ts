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
 * **起動の要求は冪等である**（openspec/specs/api/session/invoke-agent）。対象が既に走って
 * いれば要求は満たされているので、U13 は受理して新しい呼び出しを開始しない。「実行中だから
 * 受け付けない」（409 busy）は返らないので、覚えて出し直す仕掛けは持たない
 * （change fix-rename-during-running-session）。
 *
 * **待機に入ることは変わらない。** 待機に入らないと、答え終わった問いを手放す決着
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

  it('起動を要求できなければ待機に入らず、理由を返す', async () => {
    const error = httpError(500)
    fetchMock.mockRejectedValue(error)

    const w = useWaitingRetry(SESSION)
    const result = await w.requestRun()

    expect(result).toEqual({ ok: false, error })
    expect(w.waiting.value).toBe(false)
  })

  it('出し直しを持たない。`idle` を観測したら待機を降りる', async () => {
    // U13 が冪等になったので、覚えて出し直す仕掛けは無い
    // （change fix-rename-during-running-session）
    vi.useFakeTimers()

    const invokes: string[] = []
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/invoke-agent')) {
        invokes.push(url)
        return null
      }
      return { invocation: 'idle' }
    })

    const w = useWaitingRetry(SESSION)
    await w.requestRun()
    expect(w.waiting.value).toBe(true)

    await vi.advanceTimersByTimeAsync(3_000)

    expect(invokes).toHaveLength(1)
    expect(w.waiting.value).toBe(false)
  })

  it('error に達しただけでは何も消えない', async () => {
    // 完全な失敗（`docs/specs/architecture/failure.md`）はユーザーへ引き渡す状態であり、
    // 引き渡した対象を消すのはユーザーが承諾したときだけである。承諾を出すのは呼び出し側で、
    // ここは呼ばれるまで DELETE を出さない
    fetchMock.mockResolvedValue(null)

    const w = useWaitingRetry(SESSION)
    w.errored.value = true

    expect(fetchMock).not.toHaveBeenCalledWith(
      `/api/sessions/${SESSION}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('discard は承諾の後の1本だけを出す', async () => {
    fetchMock.mockResolvedValue(null)

    const w = useWaitingRetry(SESSION)
    await w.discard()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/sessions/${SESSION}`, { method: 'DELETE' })
  })

  it('再実行はリトライ回数のリセットを付ける', async () => {
    // 回数を戻すのは U13 側（`reset`）。画面は A8 を叩かない（specs/agent/invocation）
    fetchMock.mockResolvedValue(null)

    const w = useWaitingRetry(SESSION)
    await w.retryFromError()

    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/sessions/${SESSION}/invoke-agent`,
      { query: { reset: 1 } },
    )
    w.stopWaiting()
  })

  it('cwd を渡したときだけ query に載せる', async () => {
    fetchMock.mockResolvedValue(null)

    const w = useWaitingRetry(SESSION)
    await w.requestRun('/opt/projects/session-1')
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/sessions/${SESSION}/invoke-agent`,
      { query: { cwd: '/opt/projects/session-1' } },
    )
    w.stopWaiting()

    await w.requestRun()
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/sessions/${SESSION}/invoke-agent`, {})
    w.stopWaiting()
  })
})
