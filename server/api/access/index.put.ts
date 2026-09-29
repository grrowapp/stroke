import { z } from 'zod'
import type { AccessSettingsDto } from '#shared/access'
import { requireAdmin, saveAccessStore } from '../../utils/access/request'
import { parseCidr } from '../../utils/access/source'
import { parseBody } from '../../utils/stroke/request-schemas'

/**
 * ユーザー管理画面が保存する登録（`access/user-management`）。管理者でなければ 404。
 *
 * 画面の編集結果で `access.json` を置き換える。保存した後のリクエストから判定に使われる。
 */
const emailSchema = z.string().trim().toLowerCase().email('メールアドレスの形で書く。')

const saveBody = z.object({
  users: z.record(emailSchema, z.array(z.string().trim().min(1))),
  admins: z.object({
    emails: z.array(emailSchema),
    networks: z.array(
      z.string().trim().refine((value) => parseCidr(value) !== null, '接続元ネットワークは CIDR（例 192.168.1.0/24）で書く。'),
    ),
    hosts: z.array(z.string().trim().toLowerCase().min(1)),
  }),
}, { error: 'users と admins を持つ組で送る。' })

export default defineEventHandler(async (event): Promise<AccessSettingsDto> => {
  await requireAdmin(event)
  const body = parseBody(saveBody, await readBody(event))
  const store = await saveAccessStore(() => body)
  return { users: store.users, admins: store.admins }
})
