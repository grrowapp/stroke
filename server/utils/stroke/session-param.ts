import type { H3Event } from 'h3'
import { isSafeSegment } from './session-core'
import { sessionExists } from './session-store'

/**
 * URL のパスパラメータから対象の id を取る。
 *
 * id は URL に載る。単一ユーザー・認証なしなので、識別はこれだけで足りる。
 *
 * **uuid とは限らない。** 承認で昇格した対象の id はプロジェクト名になり、steering の
 * 起動（U13）と実行の記録（A8・U2）はその名前で来る。形で絞る代わりに、ディレクトリ名に
 * そのまま使えるか（保存先の外へ出られないか）だけを見て、あとは実在で判定する。
 */
export async function requireSessionId(event: H3Event): Promise<string> {
  const id = getRouterParam(event, 'id')
  if (!id || !isSafeSegment(id) || !(await sessionExists(id))) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'そのセッションは無い。',
    })
  }
  return id
}
