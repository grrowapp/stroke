// 送信後の待機・失敗の扱い（task 6.3）。待機中のみ U2 を数秒おきに読み直し、
// `invocation: failed` ならエラー表示にする。通常は W1 / W2 の配信が先に届いて
// 呼び出し側が stopWaiting() を呼ぶため、ポーリングは保険（design.md 決定6）。
// 回復（同じ入力 POST の再送）はここでは行わない。呼び出し側の役割。
import { useIntervalFn } from '@vueuse/core'
import type { Invocation } from '#shared/stroke'

const POLL_INTERVAL_MS = 3000

/**
 * busy(409) が解けてから起動要求を出し直せる回数の上限。
 *
 * 出し直した先でまた busy なら、別の実行が続けて走っている。何度でも追いかけると、
 * 画面が永久に待ち続ける形になりうるので上限を置く。使い切ったら待機を降りて、
 * 通常どおり `idle` として決着させる。
 */
const BUSY_RETRIES = 3

/** `invoke-agent` へ付ける query。`cwd` は回答後の起動、`reset` は `error` からの再実行 */
type RunQuery = { cwd?: string, reset?: number }

/** 起動要求の結果。409（busy）は待機へ倒れるので `ok: true` に含まれる */
type RunResult = { ok: true } | { ok: false, error: unknown }

/** `$fetch` が投げるエラーの状態コード。ofetch の FetchError に乗る */
function statusOf(error: unknown): number | undefined {
  const code = (error as { statusCode?: unknown } | null)?.statusCode
  return typeof code === 'number' ? code : undefined
}

export function useWaitingRetry(sessionId: MaybeRefOrGetter<string>) {
  const waiting = ref(false)
  const failed = ref(false)
  /**
   * リトライ上限に達した終端（openspec/specs/agent/invocation）。
   * `failed` と分けるのは、`failed` が巡回で自動的に起こし直されるのに対し、
   * `error` はシステムが何もせずユーザーへ引き渡す状態だからである。
   */
  const errored = ref(false)

  /**
   * busy(409) で出せなかった起動要求。解けたら出し直すために覚えておく。
   *
   * **捨ててはいけない。** 1回の `invoke-agent` = 1回の claude 実行で、続きは
   * `continuePrompt` を渡す**次の起動**でしか進まない（`server/utils/stroke/ai.ts`
   * 「1回の呼び出しで起こすのは1回だけ」）。巡回は `failed` しか拾わず
   * （`server/utils/stroke/sweep.ts`）、受理の口（U7）は起動を含まない
   * （`specs/api/answer`: 起動はフロントが要求する）。捨てると、走っていた claude が
   * 終わって `idle` になった後、**誰も次を起こさない**。
   *
   * 実測 2026-08-28（`scripts/stroke-check.ts` に残っている）: 回答は記録されたのに
   * `invocation: idle` のまま4分待って落ちた。
   */
  let pendingRun: { query: RunQuery, left: number } | null = null

  // `resume()` は張り直しのたびに前の timer を捨てるので、手で clear する必要がない。
  // scope が壊れたときの停止も内蔵している
  const poll = useIntervalFn(
    async () => {
      const status = await $fetch<{ invocation: Invocation }>(`/api/sessions/${toValue(sessionId)}`)
      if (status.invocation === 'error') {
        // 終端。巡回は拾わないので、ユーザーが再実行か削除を選ぶまで動かない。
        errored.value = true
        waiting.value = false
        pendingRun = null
        poll.pause()
      } else if (status.invocation === 'failed') {
        failed.value = true
        waiting.value = false
        pendingRun = null
        poll.pause()
      } else if (status.invocation === 'idle') {
        // **busy が解けた。出せなかった起動要求をここで出す。**
        if (pendingRun !== null && pendingRun.left > 0) {
          const retry = { query: pendingRun.query, left: pendingRun.left - 1 }
          pendingRun = null
          await run(retry.query, retry.left)
          return
        }
        waiting.value = false
        pendingRun = null
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
    // 次の問いが届いた等で決着した。出し直す理由はもう無い
    pendingRun = null
    poll.pause()
  }

  /**
   * 起動を要求して待機に入る（U13）。**受理と起動は分かれている**ので、受理の成功応答の
   * 直後に呼ぶのは呼び出し側の役目である（`specs/api/answer`・`specs/api/send-back`）。
   *
   * **409 は失敗として扱わない。** 409 は「前の claude がまだ走っている」であり、契約どおりの
   * 正常な結果である（`docs/specs/api/contract.md`）。待機へ入り、**busy が解けたら同じ要求を
   * 出し直す**（poll の `idle` 分岐）。出し直さないと誰も次を起こさない——理由は `pendingRun`
   * のコメントに書いた。
   *
   * **待機に入らないと問いを手放す決着が走らない**（`useAgentQuestion` の watch）。
   * 表示を直すだけでは、同じ問いが画面に残り続け、ユーザーは二度答えるしかなくなる
   * （実測: `strokes.json` に同じ問いへの回答が重複して記録された）。
   *
   * 例外は投げない。呼び出し側が try/catch を書くと、409 を待機へ倒す扱いを書き忘れる
   * 余地がそれぞれに戻る（design.md Decision 3）。失敗は戻り値で返し、**どう伝えるかだけ**を
   * 呼び出し側に委ねる。
   */
  async function run(query: RunQuery, retriesLeft: number): Promise<RunResult> {
    try {
      await $fetch(`/api/sessions/${toValue(sessionId)}/invoke-agent`, {
        ...(Object.keys(query).length === 0 ? {} : { query }),
      })
      pendingRun = null
    } catch (error) {
      if (statusOf(error) !== 409) return { ok: false, error }
      // busy。**要求を覚えて待つ。** 解けたら poll が出し直す（design.md Decision 1）
      pendingRun = { query, left: retriesLeft }
    }
    startWaiting()
    return { ok: true }
  }

  /** 回答・差し戻しの直後に呼ぶ起動要求。`cwd` は U2 が返した path（design.md D5） */
  async function requestRun(cwd?: string): Promise<RunResult> {
    return await run(cwd === undefined ? {} : { cwd }, BUSY_RETRIES)
  }

  /**
   * `error` からの再実行（openspec/specs/agent/invocation「ユーザーが再実行する」）。
   *
   * 回数のリセットは `reset` を付けた U13 が行う。**画面は `invocation` を直接書かない**
   * ——A8 を叩けるのは invokeAi だけである（同 spec の MUST）。
   */
  async function retryFromError(): Promise<void> {
    // ここも 409 を失敗にしない。`error` からの再実行でも、別の実行が走っていれば busy に
    // なりうる。旧来の「叩いて startWaiting」を残すと、規則を持つこのファイルの中に
    // 直したはずの形が残る（design.md Decision 3）
    const result = await run({ reset: 1 }, BUSY_RETRIES)
    if (!result.ok) throw result.error
  }

  /** `error` からの削除。回復手段のもう一方（U11）。 */
  async function discard(): Promise<void> {
    await $fetch(`/api/sessions/${toValue(sessionId)}`, { method: 'DELETE' })
  }

  return {
    waiting, failed, errored,
    startWaiting, stopWaiting, requestRun, retryFromError, discard,
  }
}
