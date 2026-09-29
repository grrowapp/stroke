import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'

import { resolveAccessUser } from '../../../../server/utils/access/identity'
import type { AccessStore } from '../../../../server/utils/access/store'
import { verifyAccessToken, type KeyResolver } from '../../../../server/utils/access/token'

/**
 * 利用者と管理者の判定（access/identity）。
 *
 * - token があれば、token のメールアドレスが利用者。管理者に指名されたメールアドレスなら管理者
 * - token が無ければ、登録された接続元ネットワークまたはホスト名からの接続を管理者とする
 */

const settings = { teamDomain: 'team.cloudflareaccess.com', aud: 'aud-tag' }

let privateKey: CryptoKey
let otherKey: CryptoKey
let keys: KeyResolver

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  otherKey = (await generateKeyPair('RS256')).privateKey
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }
  const set = createLocalJWKSet({ keys: [jwk] })
  keys = () => set
})

function sign(
  claims: Record<string, unknown>,
  { key = privateKey, aud = settings.aud, exp = '5m' }: { key?: CryptoKey; aud?: string; exp?: string } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`https://${settings.teamDomain}`)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key)
}

const store: AccessStore = {
  users: { 'guest@example.com': ['alpha'] },
  admins: { emails: ['admin@example.com'], networks: ['192.168.1.0/24'], hosts: ['xxx.grrow.app'] },
}

describe('token の検証', () => {
  it('検証に通った token のメールアドレスを小文字で返す', async () => {
    expect(await verifyAccessToken(await sign({ email: 'Guest@Example.com' }), settings, keys)).toBe('guest@example.com')
  })

  it('署名・対象の application・有効期限のどれかが合わなければ null', async () => {
    expect(await verifyAccessToken(await sign({ email: 'a@example.com' }, { key: otherKey }), settings, keys)).toBeNull()
    expect(await verifyAccessToken(await sign({ email: 'a@example.com' }, { aud: 'other' }), settings, keys)).toBeNull()
    expect(await verifyAccessToken(await sign({ email: 'a@example.com' }, { exp: '-1m' }), settings, keys)).toBeNull()
  })

  it('aud が未設定のあいだは検証しない', async () => {
    expect(await verifyAccessToken(await sign({ email: 'a@example.com' }), { ...settings, aud: '' }, keys)).toBeNull()
  })
})

describe('利用者と管理者の判定', () => {
  it('登録されたゲストが開く — そのメールアドレスの利用者で、許可のあるプロジェクトを持つ', async () => {
    const token = await sign({ email: 'guest@example.com' })
    expect(await resolveAccessUser({ token, address: '203.0.113.1', host: 'stroke.grrow.app' }, settings, store, keys)).toEqual({
      email: 'guest@example.com',
      admin: false,
      projects: ['alpha'],
    })
  })

  it('管理者に指名されたメールアドレスは管理者', async () => {
    const token = await sign({ email: 'Admin@Example.com' })
    const user = await resolveAccessUser({ token, address: undefined, host: undefined }, settings, store, keys)
    expect(user.admin).toBe(true)
  })

  it('LAN から token 無しで開く — 管理者', async () => {
    const user = await resolveAccessUser({ token: undefined, address: '192.168.1.20', host: '192.168.1.202:3100' }, settings, store, keys)
    expect(user).toEqual({ email: null, admin: true, projects: [] })
  })

  it('登録されたホスト名で token 無しで開く — 管理者', async () => {
    const user = await resolveAccessUser({ token: undefined, address: '10.0.0.1', host: 'xxx.grrow.app' }, settings, store, keys)
    expect(user.admin).toBe(true)
  })
})
