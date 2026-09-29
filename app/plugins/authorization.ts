/**
 * 画面側の利用者を `nuxt-authorization` へ渡す（design D9）。
 *
 * 利用者は `/api/access/me` がサーバーの判定をそのまま返す。画面で判定し直さない。
 * 1回の読み込みにつき1回だけ取り、`useState` で SSR からブラウザへ引き継ぐ。
 * SSR では `useRequestFetch` で取り、元のリクエストの header（token・接続元）を転送する。
 */
import type { AccessUser } from '#shared/access'
import { NO_USER } from '#shared/access'

export default defineNuxtPlugin(() => {
  const user = useState<AccessUser | null>('access-user', () => null)
  const requestFetch = useRequestFetch()

  return {
    provide: {
      authorization: {
        resolveClientUser: async () => {
          if (user.value === null) {
            user.value = await requestFetch<AccessUser>('/api/access/me').catch(() => NO_USER)
          }
          return user.value
        },
      },
    },
  }
})
