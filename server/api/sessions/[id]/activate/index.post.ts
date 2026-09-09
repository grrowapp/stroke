import type { Phase } from '#shared/stroke'
import { recordActivation, type ObservedPhase } from '../../../../handler/activate'
import { conflict } from '../../../../utils/stroke/conflict'
import { requireSessionId } from '../../../../utils/stroke/session-param'

/**
 * U15: 昇格したプロジェクトの完成を記録する（openspec/specs/api/session/activate）。
 *
 * 承認の判断（U10）・昇格（U14）・起動（U13）と同じく、承認の流れの1段を1つの endpoint が
 * 受け持つ。**起動も判断も昇格も受け持たない。** `invocation` にも触れない——実行の記録は
 * invokeAi がこの応答を見てから書く（openspec/specs/agent/invocation）。
 *
 * ## 判定を持たない（ADR-0014）
 *
 * **完成したかを、ここは決めない。** 決めるのは呼び手である——invoke-agent は実行の終わりに
 * 本家 REST を確認する判定（`invoke.ts` の `steeringCompletedUpstream`。`didWork`）で決め、
 * 生成中は3本の steering 文書と3件の承認依頼が本家に在るときだけここを叩く。起動時の
 * 書き上げは一覧が持つ実行の記録（`invocation: 'idle'`）で対象を選ぶ。この endpoint がするのは
 * `approved` → `activated` の一方向の遷移を記録することだけである。
 *
 * ファイルシステム（`.spec-workflow/` 配下）も本家の REST も読まない。呼び出し側が渡して
 * いない内部状態を見て受理の可否を変えないためで、ここに残る判定は「受け取った id に
 * 対してこの責務が成立するか」——存在しない・読めない・局面が違う——だけである
 * （ADR-0014「責務の不成立は対象外」・add-activated-phase design D3）。
 *
 * かつては `.spec-workflow/approvals/` に承認依頼のファイルが在ることを、この endpoint
 * 自身が読んで完成の根拠にしていたが、2026-09-04 に退けた——API が状態を判定していた
 * （ADR-0014）。承認依頼を根拠にすること自体は残り、判定は呼び手（invoke-agent）が本家
 * REST へ問い合わせる形で持つ。承認依頼は steering 工程の claude が本家 MCP の `approvals`
 * で出す（update-invoke-agent-responsibility-boundary design D4）。
 *
 * ## busy ガードを持たない
 *
 * ここを叩くのは invokeAi が `invocation` を `idle` に変える**前**である。その時点で対象の
 * 実行はまだ占有中なので、busy を見ると自分の実行に弾かれる（design D3）。
 *
 * ## 局面の述語はここが持ち、記録は handler が持つ
 *
 * 完成へ動かしてよい局面（下の `ACTIVATABLE`）はこの endpoint の literal である。読みと
 * 書きを1区間に閉じる必要があるので（A8 と同じ待ち行列）、状態の読みと書き込みは
 * `handler/activate.ts` が lock の中で行い、当てはまらなかったときは観測した局面を返す。
 *
 * ## 409 はすべて `phase` で返す
 *
 * 呼び手は invokeAi と起動時の書き上げだけで、どちらも 409 を「この対象は今この責務を
 * 成立させない」と読む。壊れた `state.json` は書き換えない（「分からないものを通さない」）。
 */

/** この口が完成を記録してよい局面。昇格した後だけ */
const ACTIVATABLE: readonly Phase[] = ['approved']

/** 記録できなかったときの文言。観測されたものごとに1つ */
function refusalMessage(observed: ObservedPhase): string {
  if (observed === 'unreadable') return 'state.json を読めない。完成を記録しない。'
  if (observed === 'activated') return 'このプロジェクトは既に完成している。'
  return 'まだ昇格していない。完成を記録できるのはプロジェクトだけ。'
}

export default defineEventHandler(async (event): Promise<Response> => {
  const name = await requireSessionId(event)

  const recorded = await recordActivation(name, ACTIVATABLE)
  if (!recorded.ok) {
    throw conflict('phase', refusalMessage(recorded.observed))
  }

  return new Response(null, { status: 204 })
})
