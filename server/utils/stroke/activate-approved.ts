import type { SessionSummary } from '#shared/stroke'

/**
 * 起動時の書き上げ（openspec/specs/project/generation「既に完成しているプロジェクトは
 * 起動時に完成を記録し直す」・add-activated-phase design D9）。
 *
 * 完成の記録（`activated`）が導入される前に昇格し、既に承認依頼を持つプロジェクトは
 * `approved` のまま残っている。そのままでは全部が生成中として並び、入れなくなる。
 * 起動のたびに一度、`approved` の対象それぞれに U15 を叩いて書き上げる。
 *
 * **判定を持たない。** 承認依頼の有無を見るのは U15 の1箇所で、ここは `approved` の件に
 * 叩いて結果を数えるだけ（「判定の根拠は `api/session/activate` と同じとし、別の基準を
 * 持ってはならない」）。409 は「まだ完成でない」で、生成中のまま残す。
 *
 * `server/plugins/01.activate-approved.ts` から Nitro の `$fetch` を渡して呼ばれる。ここでは
 * Nitro を知らない——依存を引数で受け取ることで、Nitro の外（vitest）から確かめられる
 * （`reap.ts` と同じ理由）。
 */

/** `activateApproved` が要る依存。実体は `server/plugins/01.activate-approved.ts` が組み立てる。 */
export interface ActivateDeps {
  /**
   * U15（`POST /api/sessions/:id/activate`）を叩く。受理されたら `'activated'`、
   * 409（まだ完成でない・既に完成）なら `'not-yet'`、それ以外の失敗なら `'failed'` を返す。
   */
  activate: (sessionId: string) => Promise<ActivateResult>
}

export type ActivateResult = 'activated' | 'not-yet' | 'failed'

/** 書き上げの結果。`server/plugins/01.activate-approved.ts` がログへ出す。 */
export interface ActivateCounts {
  /** `activated` を書き上げた件数 */
  activated: number
  /** 承認依頼がまだ無く、生成中のまま残した件数 */
  notYet: number
  /** U15 が受理も 409 も返さなかった件数（不達・500） */
  failed: number
}

/**
 * `approved` の対象を書き上げる。1件の失敗で他の件を止めない。
 */
export async function activateApproved(
  sessions: readonly SessionSummary[],
  deps: ActivateDeps,
): Promise<ActivateCounts> {
  const counts: ActivateCounts = { activated: 0, notYet: 0, failed: 0 }

  for (const session of sessions) {
    if (session.phase !== 'approved') continue

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

/** HTTP の失敗を `ActivateResult` に写す。409 だけが「まだ完成でない」。 */
export function activateResultOf(error: unknown): ActivateResult {
  const status = typeof error === 'object' && error !== null
    ? (error as { statusCode?: unknown, status?: unknown })
    : undefined
  const code = status?.statusCode ?? status?.status
  return code === 409 ? 'not-yet' : 'failed'
}
