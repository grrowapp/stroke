/**
 * 見られない対象の URL を開いたら 404 の画面にする（`access/permission`・`access/user-management`）。
 *
 * 遷移の設計は `docs/specs/architecture/screen-flow.md`「自動の遷移」。ここが持つのは 404 の画面を
 * 出すことだけで、**別の URL へは移さない**。
 *
 * - `/admin/**` — 管理者でなければ 404
 * - `/projects/<projectId>/**`・`/strokes/<sessionId>/**` — 在るが見られなければ 404。
 *   **無いときは何もしない。** 無いときの振る舞い（`/strokes/<sessionId>` なら `/` へ移す）は
 *   各画面が持ち、ここで塗り替えない
 */
import { manageAccess } from '#shared/access'

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path.startsWith('/admin')) {
    if (!(await allows(manageAccess))) return showError({ statusCode: 404, statusMessage: 'Not Found' })
    return
  }

  const query = checkQueryOf(to.params)
  if (query === null) return

  try {
    await useRequestFetch()('/api/access/check', { query })
  } catch (error) {
    // 404 だけが「見られない」。それ以外の失敗は画面へ進め、画面自身の API の失敗として出す
    if ((error as { statusCode?: number }).statusCode === 404) {
      return showError({ statusCode: 404, statusMessage: 'Not Found' })
    }
  }
})

/** 確かめる対象。ルートの引数から取る。対象を持たない画面は null */
function checkQueryOf(params: Record<string, unknown>): Record<string, string> | null {
  if (typeof params.projectId === 'string') return { projectId: params.projectId }
  if (typeof params.sessionId === 'string') return { sessionId: params.sessionId }
  return null
}
