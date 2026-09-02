/**
 * 提出（A5 question・A7 proposal・steering 文書）が届いたことの記録。
 *
 * **完了の合図ではない。** 完了は invokeAi が子プロセスの output stream で検知する
 * （openspec/specs/agent/invocation）。ここが答えるのは「その実行で作業が行われたか」で、
 * 完了の検知とは別の問いである。
 *
 * **キーの取り方が2つある。** 受理する endpoint が誰かで変わる。
 *
 * - flontier（A5・A7）: 受理する endpoint がこの stroke-board 自身にあり、対象の
 *   `sessionId` で数えられる。以下の `counts`（既存）がこちらを持つ
 * - steering: 受理するのは代行先（本家 spec-workflow）で、stroke-board の endpoint を
 *   1つも通らない。`sessionId` に結びつける経路が無いので、ツール
 *   （`server/mcp/tools/submit-document.ts`）がその場で「どの起動から呼ばれたか」
 *   （接続 token）を単位に数える。以下の `launchCounts` がこちらを持つ
 *
 * 2種類のキーを1つの `Map` に混ぜない——`forgetSubmissions(sessionId)` が何を消して
 * いるのかが読めなくなる（fix-steering-empty-completion design.md D3）。
 *
 * ストロークの1回の実行は、必ず A5 か A7 のどちらかの提出で終わる。steering の1回の
 * 実行は、steering 文書の提出（本家が受理したもの）で終わる。プロセスが正常終了しても
 * 提出が1つも無ければ、それは作業をせずに終わったということで、失敗として扱って
 * 起こし直す。これが無いと、`invocation` が `idle` のまま何も進まないセッションが残り、
 * 巡回（`failed` しか拾わない）も回収できない。
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

/**
 * 起動（接続 token）単位の提出記録。steering の提出はここに載る。
 *
 * 数えるのは代行先（本家 spec-workflow）が受理した経路だけ——拒否・不達・手前で弾いた
 * 400 では記録しない（`submit-document.ts` の責務）。
 */
const launchCounts = new Map<string, number>()

/** その起動（token）で提出が1つ受理された。`submit-document` の steering 分岐が呼ぶ。 */
export function recordLaunchSubmission(token: string): void {
  launchCounts.set(token, (launchCounts.get(token) ?? 0) + 1)
}

/** その起動（token）で、これまでに受理された提出があるか。 */
export function hasLaunchSubmission(token: string): boolean {
  return (launchCounts.get(token) ?? 0) > 0
}

/** 起動が終わったら記録を捨てる。`kick` の `.finally`（`removeConnection` と並べる）が呼ぶ。 */
export function forgetLaunchSubmission(token: string): void {
  launchCounts.delete(token)
}
