/**
 * 提出（A5 question・A7 proposal）が届いたことの記録。
 *
 * **完了の合図ではない。** 完了は invokeAi が子プロセスの output stream で検知する
 * （openspec/specs/agent/invocation）。ここが答えるのは「その実行で作業が行われたか」で、
 * 完了の検知とは別の問いである。
 *
 * ストロークの1回の実行は、必ず A5 か A7 のどちらかの提出で終わる。プロセスが正常終了
 * しても提出が1つも無ければ、それは作業をせずに終わったということで、失敗として扱って
 * 起こし直す。これが無いと、`invocation` が `idle` のまま問いも proposal も出ない
 * セッションが残り、巡回（`failed` しか拾わない）も回収できない。
 *
 * 単一ユーザー・単一プロセスの MVP なのでメモリ上で足りる。
 */
const counts = new Map<string, number>()

/** 提出を1つ数える。A5・A7 の受理が呼ぶ。 */
export function notifySubmission(sessionId: string): void {
  counts.set(sessionId, (counts.get(sessionId) ?? 0) + 1)
}

/** これまでの提出数。実行の前後で比べて、その実行で提出があったかを見る。 */
export function submissionCount(sessionId: string): number {
  return counts.get(sessionId) ?? 0
}

/** セッションが消えたら記録も落とす。 */
export function forgetSubmissions(sessionId: string): void {
  counts.delete(sessionId)
}
