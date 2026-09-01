import type { Invocation } from '#shared/stroke'

/**
 * 起こし直す対象を拾う巡回の判定（openspec/specs/portal/batch）。
 *
 * plugin から切り離してあるのは、Nitro の外（テスト）から判定だけを確かめられるように
 * するためである。巡回そのものは `server/plugins/01.retry-failed.ts`。
 */

/**
 * 起こし直す対象か。**`failed` だけ**を拾う。
 *
 * `failed` は「失敗した実行」に限らず**「起こし直す対象」**の印である。実行が失敗したときの
 * ほかに、昇格の受け口（U14・`promote.post.ts`）が「steering の起動がまだ済んでいない」
 * ことをこの値で残し、`01.retry-failed.ts` の初回の刈り取りが前のプロセスの残骸
 * （`running`）をこの値へ倒す。いずれも「誰も起こし直さないから」拾わせるための用法である。
 *
 * - `running` の時間切れ判定は invokeAi の責務（プロセス内の見張り）
 * - `idle` にはやり直すものが無い
 * - `error` はリトライ上限に達した終端で、ユーザーへ引き渡す
 *
 * 巡回が持つ判定はこれ1つである。上限判定も定型の選択も invokeAi の仕事なので、
 * ここでは回数を見ない。**値を増やしてここへ条件を足さない**（同 spec の MUST NOT）。
 */
export function shouldRetry(invocation: Invocation): boolean {
  return invocation === 'failed'
}

