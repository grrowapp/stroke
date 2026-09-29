import type { AccessUser } from '#shared/access'
import { NO_USER } from '#shared/access'
import { matchesHost, matchesNetwork } from './source'
import type { AccessStore } from './store'
import { verifyAccessToken, type KeyResolver, type TokenSettings } from './token'

/**
 * 利用者と管理者を判定する（`access/identity`）。
 *
 * - token があれば、token のメールアドレスが利用者。管理者に指名されたメールアドレスなら管理者
 * - token が無ければ、登録された接続元ネットワークまたはホスト名からの接続を管理者とする
 *
 * Nitro に依存しない。リクエストから取り出した材料と、設定・登録を受け取る。
 */

export interface RequestMaterial {
  /** `Cf-Access-Jwt-Assertion` の値。無ければ undefined */
  token: string | undefined
  /** 接続元のアドレス */
  address: string | undefined
  /** `Host` header の値 */
  host: string | undefined
}

export async function resolveAccessUser(
  material: RequestMaterial,
  settings: TokenSettings,
  store: AccessStore,
  resolveKeys?: KeyResolver,
): Promise<AccessUser> {
  if (material.token !== undefined) {
    const email = await verifyAccessToken(material.token, settings, resolveKeys)
    if (email === null) return NO_USER
    return {
      email,
      admin: store.admins.emails.includes(email),
      projects: store.users[email] ?? [],
    }
  }

  const admin =
    matchesNetwork(material.address, store.admins.networks) || matchesHost(material.host, store.admins.hosts)
  return { email: null, admin, projects: [] }
}
