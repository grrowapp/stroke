import { allows } from 'nuxt-authorization/utils'
import { viewProject } from '#shared/access'
import { accessUserOf, canViewSession, projectNameOf, shareRoot } from '../../../utils/access/request'
import { readStartedBy } from '../../../utils/access/started-by'

/**
 * 画面を開く前に、その URL の対象を見られるかを確かめる口（`app/middleware/access.global.ts`）。
 *
 * 見られなければ 404、それ以外は 204 を返す。**対象が無いときは 204 を返す**——無いときの
 * 振る舞い（`/strokes/<sessionId>` なら `/` へ移す）は各画面が持っており、ここで 404 にすると
 * その既存の遷移を塗り替えてしまう（`docs/specs/architecture/screen-flow.md`「自動の遷移」）。
 *
 * query は `projectId`（本家の id）か `sessionId`（セッションの id）のどちらか1つ。
 */
export default defineEventHandler(async (event): Promise<null> => {
  const query = getQuery(event)
  const user = await accessUserOf(event)

  if (typeof query.sessionId === 'string') {
    const record = await readStartedBy(shareRoot(), query.sessionId)
    if (record !== null && !(await canViewSession(user, query.sessionId))) throw notFound()
  } else if (typeof query.projectId === 'string') {
    const name = user.admin ? null : await projectNameOf(query.projectId)
    if (name !== null && !(await allows(viewProject, user, name))) throw notFound()
  }

  setResponseStatus(event, 204)
  return null
})

function notFound(): Error {
  return createError({ statusCode: 404, statusMessage: 'Not Found' })
}
