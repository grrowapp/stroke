import type { Invocation } from '#shared/stroke'

/**
 * 失敗した実行を起こし直す巡回の判定（openspec/specs/portal/batch）。
 *
 * plugin から切り離してあるのは、Nitro の外（テスト）から判定だけを確かめられるように
 * するためである。巡回そのものは `server/plugins/02.retry-failed.ts`。
 */

/**
 * 起こし直す対象か。**`failed` だけ**を拾う。
 *
 * - `running` の時間切れ判定は invokeAi の責務（プロセス内の見張り）
 * - `idle` にはやり直すものが無い
 * - `error` はリトライ上限に達した終端で、ユーザーへ引き渡す
 *
 * 巡回が持つ判定はこれ1つである。上限判定も定型の選択も invokeAi の仕事なので、
 * ここでは回数を見ない。
 */
export function shouldRetry(invocation: Invocation): boolean {
  return invocation === 'failed'
}

