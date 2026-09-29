import type { AccessUser } from '#shared/access'
import { accessUserOf } from '../../../utils/access/request'

/**
 * このリクエストの利用者を返す。画面が自分の利用者を知るための口で、`nuxt-authorization` の
 * `resolveClientUser` がここを読む（design D9）。
 *
 * 判定の結果をそのまま返すだけで、ここで判定は足さない。
 */
export default defineEventHandler(async (event): Promise<AccessUser> => {
  return accessUserOf(event)
})
