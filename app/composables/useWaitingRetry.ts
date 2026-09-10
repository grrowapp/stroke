// 送信後の待機・失敗の扱い（task 6.3）。待機中のみ U2 を数秒おきに読み直し、
// `invocation: failed` ならエラー表示にする。通常は W1 / W2 の配信が先に届いて
// 呼び出し側が stopWaiting() を呼ぶため、ポーリングは保険（design.md 決定6）。
// 回復（同じ入力 POST の再送）はここでは行わない。呼び出し側の役割。
import { useIntervalFn } from '@vueuse/core'
import type { Invocation } from '#shared/stroke'

const POLL_INTERVAL_MS = 3000

/** `invoke-agent` へ付ける query。`cwd` は回答後の起動、`reset` は `error` からの再実行 */
type RunQuery = { cwd?: string, reset?: number }

/** 起動要求の結果。 */
type RunResult = { ok: true } | { ok: false, error: unknown }

export function useWaitingRetry(sessionId: MaybeRefOrGetter<string>) {
  const waiting = ref(false)
  const failed = ref(false)
  /**
   * リトライ上限に達した終端（openspec/specs/agent/invocation）。
   * `failed` と分けるのは、`failed` が巡回で自動的に起こし直されるのに対し、
   * `error` はシステムが何もせずユーザーへ引き渡す状態だからである。
   */
  const errored = ref(false)


  // `resume()` は張り直しのたびに前の timer を捨てるので、手で clear する必要がない。
  // scope が壊れたときの停止も内蔵している
  const poll = useIntervalFn(
    async () => {
      const status = await $fetch<{ invocation: Invocation }>(`/api/sessions/${toValue(sessionId)}`)
      if (status.invocation === 'error') {
        // 終端。巡回は拾わないので、ユーザーが再実行か削除を選ぶまで動かない。
        errored.value = true
        waiting.value = false
        poll.pause()
      } else if (status.invocation === 'failed') {
        failed.value = true
        waiting.value = false
        poll.pause()
      } else if (status.invocation === 'idle') {
        waiting.value = false
        poll.pause()
      }
    },
    POLL_INTERVAL_MS,
    { immediate: false },
  )

  function startWaiting(): void {
    waiting.value = true
    failed.value = false
    errored.value = false
    // ポーリングはブラウザでのみ意味を持つ。SSR で `setInterval` を張ると Nuxt が
    // 例外にする（実測: reload 直後の SSR で `invocation: running` を踏んで判明）。
    // `resume()` は client 限定のガードを持たないので、ここで止める必要がある
    if (import.meta.server) return
    poll.resume()
  }

  function stopWaiting(): void {
    waiting.value = false
    failed.value = false
    errored.value = false
    poll.pause()
  }

  /**
   * 起動を要求して待機に入る（U13）。**受理と起動は分かれている**ので、受理の成功応答の
   * 直後に呼ぶのは呼び出し側の役目である（`specs/api/answer`・`specs/api/send-back`）。
   *
   * **出し直しを持たない。** 起動の要求は冪等で、対象が既に走っていればその要求は満たされて
   * いる（openspec/specs/api/session/invoke-agent）。「実行中だから受け付けない」（409 busy）は
   * 返らないので、覚えて出し直す仕掛けは要らない（change fix-rename-during-running-session）。
   *
   * **待機に入らないと問いを手放す決着が走らない**（`useAgentQuestion` の watch）。
   * 表示を直すだけでは、同じ問いが画面に残り続け、ユーザーは二度答えるしかなくなる
   * （実測: `strokes.json` に同じ問いへの回答が重複して記録された）。
   *
   * 例外は投げない。呼び出し側が try/catch を書くと、409 を待機へ倒す扱いを書き忘れる
   * 余地がそれぞれに戻る（design.md Decision 3）。失敗は戻り値で返し、**どう伝えるかだけ**を
   * 呼び出し側に委ねる。
   */
  async function run(query: RunQuery): Promise<RunResult> {
    try {
      await $fetch(`/api/sessions/${toValue(sessionId)}/invoke-agent`, {
        ...(Object.keys(query).length === 0 ? {} : { query }),
      })
    } catch (error) {
      return { ok: false, error }
    }
    startWaiting()
    return { ok: true }
  }

  /** 回答・差し戻しの直後に呼ぶ起動要求。`cwd` は U2 が返した path（design.md D5） */
  async function requestRun(cwd?: string): Promise<RunResult> {
    return await run(cwd === undefined ? {} : { cwd })
  }

  /**
   * `error` からの再実行（openspec/specs/agent/invocation「ユーザーが再実行する」）。
   *
   * 回数のリセットは `reset` を付けた U13 が行う。**画面は `invocation` を直接書かない**
   * ——A8 を叩けるのは invokeAi だけである（同 spec の MUST）。
   */
  async function retryFromError(): Promise<void> {
    const result = await run({ reset: 1 })
    if (!result.ok) throw result.error
  }

  /**
   * `error` からの削除（U11）。**破壊を伴う選択肢なので、承諾を得た後にだけ呼ぶ**
   * （`docs/specs/architecture/failure.md`「破壊を伴う選択肢の承諾」）。承諾の一手を
   * 出すのは呼び出し側で、ここは消えるものを示す責務を持たない。
   *
   * 消した後の行き先は概要の入力である。やり直しの起点はそこであって、消した対象の
   * 一覧ではない。
   */
  async function discard(): Promise<void> {
    // **URL を `string` として渡す。** `/api/sessions/unfinished`（U16）が静的な兄弟として
  // 増えたことで、`/api/sessions/${…}` の型が GET だけに狭まり、DELETE が通らなくなる
  // （Nitro の typed routes の性質）。実体の route は `sessions/[id]/index.delete.ts` に在る
    await $fetch(`/api/sessions/${toValue(sessionId)}` as string, { method: 'DELETE' })
  }

  return {
    waiting, failed, errored,
    startWaiting, stopWaiting, requestRun, retryFromError, discard,
  }
}
