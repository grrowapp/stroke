import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/**
 * Cloudflare Access の token（`Cf-Access-Jwt-Assertion`）を検証し、メールアドレスを取り出す。
 *
 * 署名・有効期限・`aud`・`iss` を確かめる。稼働中の cloudflared が検証しているかを
 * stroke-board から確かめられず、header は誰でも付けられるためである（design D2）。
 *
 * Nitro に依存しない。team domain と aud は呼び出し側が渡す。
 */

/** token を運ぶ header の名前。Cloudflare Access が origin へのリクエストに付ける */
export const ACCESS_TOKEN_HEADER = 'cf-access-jwt-assertion'

export interface TokenSettings {
  /** 例 `royal-frost-b225.cloudflareaccess.com` */
  teamDomain: string
  /** Access application の AUD tag */
  aud: string
}

/**
 * 公開鍵の取り方。既定は team の certs を引く。`kid` で鍵を選び、ローテーションには
 * jose の取り直しが追随する。test では手元の鍵へ差し替える。
 */
export type KeyResolver = (settings: TokenSettings) => JWTVerifyGetKey

const remoteKeys = new Map<string, JWTVerifyGetKey>()

export const remoteKeyResolver: KeyResolver = ({ teamDomain }) => {
  let keys = remoteKeys.get(teamDomain)
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
    remoteKeys.set(teamDomain, keys)
  }
  return keys
}

/**
 * 検証に通った token のメールアドレス（小文字）を返す。通らなければ null。
 *
 * 失敗の理由（署名・期限・aud・鍵が取れない）は区別しない。どれも「利用者なし」になる。
 */
export async function verifyAccessToken(
  token: string,
  settings: TokenSettings,
  resolveKeys: KeyResolver = remoteKeyResolver,
): Promise<string | null> {
  // aud が未設定のあいだは検証できない。通すと aud の照合が抜ける
  if (!settings.teamDomain || !settings.aud) return null
  try {
    const { payload } = await jwtVerify(token, resolveKeys(settings), {
      audience: settings.aud,
      issuer: `https://${settings.teamDomain}`,
    })
    const email = payload.email
    return typeof email === 'string' && email.length > 0 ? email.toLowerCase() : null
  } catch {
    return null
  }
}
