import type { AccessSettingsDto } from '#shared/access'
import { loadAccessStore, requireAdmin } from '../../utils/access/request'

/**
 * ユーザー管理画面が読む登録（`access/user-management`）。管理者でなければ 404。
 *
 * `access.json` がまだ無いあいだの管理者の登録は、`nuxt.config.ts` の初期値が返る。
 */
export default defineEventHandler(async (event): Promise<AccessSettingsDto> => {
  await requireAdmin(event)
  const store = await loadAccessStore()
  return { users: store.users, admins: store.admins }
})
