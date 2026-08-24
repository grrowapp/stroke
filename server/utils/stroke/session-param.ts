import type { H3Event } from 'h3'
import { isSessionId } from './session-core'
import { sessionExists } from './session-store'

/**
 * URL のパスパラメータからセッション uuid を取る。
 *
 * uuid は URL に載る（`/s/<uuid>`）。単一ユーザー・認証なしなので、識別はこれだけで足りる。
 * ディレクトリ名にそのまま使うため、uuid の形をしていないものは通さない。
 */
export async function requireSessionId(event: H3Event): Promise<string> {
  const id = getRouterParam(event, 'id')
  if (!id || !isSessionId(id) || !(await sessionExists(id))) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'そのセッションは無い。',
    })
  }
  return id
}
