/**
 * 提出（A5 question・A7 proposal）が届いたことの記録。
 *
 * **完了の合図ではない。** 完了は invokeAi が子プロセスの output stream で検知する
 * （openspec/specs/agent/invocation）。ここが答えるのは「その実行で作業が行われたか」で、
 * 完了の検知とは別の問いである。
 *
 * ここに載るのは flontier（A5・A7）だけである。受理する endpoint がこの stroke-board 自身に
 * あり、対象の `sessionId` で数えられる。数えるのは受理した endpoint 自身で、MCP ツールは
 * 数えない（`docs/specs/mcp/contract.md`「代行以外の固定の処理を受け持たない」）。
 *
 * steering の判定はここに無い。かつては `submit-document` が本家 PUT の受理を起動 token の
 * 記録に残していたが、MCP ツールに判定の材料を作らせない形へ改め、invoke-agent が実行の
 * 終わりに本家 REST へ問い合わせて判定する（`invoke.ts` の `steeringCompletedUpstream`・
 * `docs/specs/architecture/invoke-agent.md`。update-invoke-agent-responsibility-boundary）。
 *
 * ストロークの1回の実行は、必ず A5 か A7 のどちらかの提出で終わる。プロセスが正常終了
 * しても提出が1つも無ければ、それは作業をせずに終わったということで、失敗として扱って
 * 起動し直す。これが無いと、`invocation` が `idle` のまま何も進まないセッションが残り、
 * 巡回（`failed` しか拾わない）も回収できない。
 *
 * 単一ユーザー・単一プロセスの MVP なのでメモリ上で足りる。
 */

/** flontier（A5・A7）の提出の記録。キーは対象の `sessionId`、値はこれまでの提出数。 */
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
