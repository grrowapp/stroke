import type { SessionSummary } from '#shared/stroke'

/**
 * 起動時の書き上げ（openspec/specs/project/generation「既に完成しているプロジェクトは
 * 起動時に完成を記録し直す」・add-activated-phase design D9）。
 *
 * 完成の記録（`activated`）が導入される前に昇格し、生成を終えていたプロジェクトは
 * `approved` のまま残っている。そのままでは全部が生成中として並び、入れなくなる。
 * 起動のたびに一度、対象それぞれに U15 を叩いて書き上げる。
 *
 * **対象は一覧が持つ state から選ぶ。** `approved` かつ実行の記録が `idle` のもの——
 * 導入前に生成を終えていたもの——だけを通す。`failed` / `error` / `running` は生成中の
 * まま残す（`running` は `01.reap-running.ts` が `failed` に倒し、巡回が拾う）。
 * **ファイルシステムを見て成果物を数えない**（`.spec-workflow/` は生成（P2）の依頼を本家が
 * 受理したときにでき、AI が起動する前、成果物が無いうちから在る）。U15 も判定を持たないので、完成したかを決めるのは
 * この選び方そのものである（ADR-0014・design D9）。
 *
 * `server/plugins/01.activate-approved.ts` から Nitro の `$fetch` を渡して呼ばれる。ここでは
 * Nitro を知らない——依存を引数で受け取ることで、Nitro の外（vitest）から確かめられる
 * （`reap.ts` と同じ理由）。
 */

/** `activateApproved` が要る依存。実体は `server/plugins/01.activate-approved.ts` が組み立てる。 */
export interface ActivateDeps {
  /**
   * U15（`POST /api/sessions/:id/activate`）を叩く。受理されたら `'activated'`、
   * 409（局面が違う・既に完成）なら `'not-yet'`、それ以外の失敗なら `'failed'` を返す。
   */
  activate: (sessionId: string) => Promise<ActivateResult>
}

export type ActivateResult = 'activated' | 'not-yet' | 'failed'

/** 書き上げの結果。`server/plugins/01.activate-approved.ts` がログへ出す。 */
export interface ActivateCounts {
  /** `activated` を書き上げた件数 */
  activated: number
  /** U15 が 409 で断り、生成中のまま残した件数 */
  notYet: number
  /** U15 が受理も 409 も返さなかった件数（不達・500） */
  failed: number
}

/**
 * 書き上げる対象か。**`approved` かつ実行の記録が `idle`** のものだけを通す。
 *
 * 完成の記録の導入前に生成を終えていたものは、最後の実行が正常終了して `idle` のまま
 * 残っている。`failed` / `error` は生成が終わっていないもの（巡回とユーザーの再実行が
 * 拾う）、`running` は起動時の後始末（`01.reap-running.ts`）が `failed` へ倒す途中なので、
 * どれも生成中のまま残す。
 *
 * **`idle` は一覧が返した値である。** 一覧（`server/handler/session.ts` の `listSessions`）は
 * 読めない値・知らない値も `idle` として載せるので、`invocation` を持たない古い
 * `state.json` もここを通る。導入前のものを畳むのがこの処理の目的なので、それでよい
 * （design Risks「成果物ゼロの legacy を畳む」が同じ性質のものとして許容している）。
 */
function shouldActivate(session: SessionSummary): boolean {
  return session.phase === 'approved' && session.invocation === 'idle'
}

/**
 * 導入前に生成を終えていた対象を書き上げる。1件の失敗で他の件を止めない。
 */
export async function activateApproved(
  sessions: readonly SessionSummary[],
  deps: ActivateDeps,
): Promise<ActivateCounts> {
  const counts: ActivateCounts = { activated: 0, notYet: 0, failed: 0 }

  for (const session of sessions) {
    if (!shouldActivate(session)) continue

    // 依存が投げても他の件を止めない。投げた分は「記録できなかった」に数える
    let result: ActivateResult
    try {
      result = await deps.activate(session.id)
    } catch {
      result = 'failed'
    }
    if (result === 'activated') counts.activated += 1
    else if (result === 'not-yet') counts.notYet += 1
    else counts.failed += 1
  }

  return counts
}

/** HTTP の失敗を `ActivateResult` に写す。409 だけが「生成中のまま残す」。 */
export function activateResultOf(error: unknown): ActivateResult {
  const status = typeof error === 'object' && error !== null
    ? (error as { statusCode?: unknown, status?: unknown })
    : undefined
  const code = status?.statusCode ?? status?.status
  return code === 409 ? 'not-yet' : 'failed'
}
