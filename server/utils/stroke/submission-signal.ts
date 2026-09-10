/**
 * 提出（A5 question・A7 proposal）が届いたことの、**起動（接続 token）単位**の記録。
 *
 * **完了の合図ではない。** 完了は invokeAi が子プロセスの output stream で検知する
 * （openspec/specs/agent/invocation）。ここが答えるのは「その起動で何が提出されたか」で、
 * 完了の検知とは別の問いである。
 *
 * 記録は2つの問いに答える。
 *
 * - **その起動で作業が行われたか**（`hasLaunchSubmission`）。プロセスが正常終了しても、
 *   提出が1つも無ければ作業をせずに終わったということで、失敗として扱って起動し直す。
 *   これが無いと `invocation` が `idle` のまま何も進まないセッションが残り、巡回
 *   （`failed` しか拾わない）も回収できない
 * - **その起動で何が提出されたか**（`launchSubmissionKinds`）。invokeAi は実行の決着で、
 *   提出されたものに応じて局面を切り替え、画面へ届ける
 *   （openspec/specs/agent/invocation「完了は output stream で検知して idle に変える」）
 *
 * **単位は対象の id ではなく起動である。** 決着は「この実行で何が起きたか」に答えるもので、
 * 前の実行の提出を数えてはならない。かつては対象の `sessionId` で提出数を持ち、起動の前後で
 * 比べていたが、その形では「何が」提出されたかを持てず、決着の材料にならない
 * （change fix-rename-during-running-session）。
 *
 * **ここに載るのは flontier（A5・A7）だけである。** 記録するのは受理した endpoint 自身で、
 * MCP ツールは記録しない（`docs/specs/mcp/contract.md`「代行以外の固定の処理を受け持た
 * ない」）。ツールがするのは、その提出を起こした claude の接続 token をそのまま転送する
 * ことだけである。
 *
 * steering の判定はここに無い。かつては `submit-document` が本家 PUT の受理を起動 token の
 * 記録に残していたが、MCP ツールに判定の材料を作らせない形へ改め、invoke-agent が実行の
 * 終わりに本家 REST へ問い合わせて判定する（`invoke.ts` の `steeringCompletedUpstream`・
 * `docs/specs/architecture/invoke-agent.md`。update-invoke-agent-responsibility-boundary）。
 *
 * 記録を作るのは、その起動がまだ実行中のときだけである（`isConnectionActive`）。打ち切りで
 * 実行が先に畳まれた後に記録を作ると、`kick` の `.finally`（`removeConnection` →
 * `forgetLaunchSubmission`）が済んだ後に残り、誰も捨てない。
 *
 * 単一ユーザー・単一プロセスの MVP なのでメモリ上で足りる。
 */

import { isConnectionActive } from '../mcp/connection-table'

/**
 * 何が提出されたか。
 *
 * 決着の中身を分ける——問いは画面へ配信するだけ、proposal は phase を `proposed` にしてから
 * 配信する。
 */
export type SubmissionKind = 'question' | 'proposal'

/** 起動（接続 token）→ その起動で受理された提出の種別。 */
const launchSubmissions = new Map<string, Set<SubmissionKind>>()

/** その起動（token）で提出が1つ受理された。受理した endpoint（A5・A7）が呼ぶ。 */
export function recordLaunchSubmission(token: string, kind: SubmissionKind): void {
  const kinds = launchSubmissions.get(token)
  if (kinds === undefined) {
    launchSubmissions.set(token, new Set([kind]))
    return
  }
  kinds.add(kind)
}

/**
 * その起動がまだ実行中のときだけ記録する。**記録する側はすべてこれを通す。**
 *
 * 打ち切り（タイムアウト）で claude を殺しても、飛行中の提出を処理しているハンドラは
 * 中断されない。無条件に記録すると、`kick` の `.finally`（`removeConnection` →
 * `forgetLaunchSubmission`）が済んだ後に記録が作り直され、誰も捨てないまま残る。
 *
 * **判定と記録の間に `await` を置かない。** 片付けは1つの同期ブロックなので、間に `await`
 * が無ければ「片付けの前」か「片付けの後」のどちらかにしかならない（`isConnectionActive`）。
 *
 * token を持たない呼び出し（起動の外から直に叩かれたもの）は記録しない。決着の材料は
 * 起動に属するものだけである。
 */
export function recordLaunchSubmissionIfActive(
  token: string | undefined,
  kind: SubmissionKind,
): void {
  if (token === undefined || !isConnectionActive(token)) return
  recordLaunchSubmission(token, kind)
}

/** その起動（token）で、これまでに受理された提出があるか。 */
export function hasLaunchSubmission(token: string): boolean {
  return launchSubmissions.has(token)
}

/** その起動（token）で受理された提出の種別。invokeAi が決着の材料に読む。 */
export function launchSubmissionKinds(token: string): ReadonlySet<SubmissionKind> {
  return launchSubmissions.get(token) ?? new Set<SubmissionKind>()
}

/** 起動が終わったら記録を捨てる。`kick` の `.finally`（`removeConnection` と並べる）が呼ぶ。 */
export function forgetLaunchSubmission(token: string): void {
  launchSubmissions.delete(token)
}
