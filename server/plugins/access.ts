import { defineNitroPlugin } from 'nitropack/runtime'

import { accessUserOf } from '../utils/access/request'

/**
 * リクエストごとに利用者を求める口を `event.context` に置く（design D1）。
 *
 * 求めるのは使われたときで（`accessUserOf`）、ここは置くだけである。
 *
 * - `nuxt-authorization` の server 側の `allows` / `denies` が読む `resolveServerUser`
 * - SSR の `useFetch` が出す内部呼び出しにも同じ接続元が届くよう、`x-forwarded-for` が
 *   無ければ socket のアドレスを入れる。`useFetch` は header を転送するが socket の
 *   アドレスは転送しない（design D4）
 *
 * `/mcp` は `server/middleware/mcp-token.ts` が守り、ここで求める利用者を使わない。
 * WebSocket の upgrade はこの hook を通らないので、各 handler が自分で求める（design D6）。
 */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', (event) => {
    const headers = event.node.req.headers
    const address = event.node.req.socket?.remoteAddress
    if (headers['x-forwarded-for'] === undefined && address) headers['x-forwarded-for'] = address

    event.context.$authorization = {
      resolveServerUser: () => accessUserOf(event),
    } as typeof event.context.$authorization
  })
})
