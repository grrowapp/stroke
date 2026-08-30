import { createError, defineEventHandler, getRequestHeaders } from 'h3'

import { resolveConnection } from '../utils/mcp/connection-table'

/**
 * MCP の受け口を token で守る。
 *
 * **ツールハンドラの中で 401 を throw しても HTTP には出ない。** モジュールの
 * `normalizeErrorToResult`（`@nuxtjs/mcp-toolkit/dist/runtime/server/mcp/definitions/tools.js`）が
 * ハンドラの throw を `{ content: [...], isError: true }` へ畳むので、応答は HTTP 200 の
 * JSON-RPC になる。MCP SDK にも `isError` を HTTP の状態へ写す経路は無い
 * （`@modelcontextprotocol/sdk/dist/esm/server/mcp.js`: `isError` のときは outputSchema の
 * 検証を飛ばすだけ）。「有効な token を持たないツール呼び出しは HTTP 401 で拒否する」
 * （specs `server/session-management`）を満たすには、ツールハンドラより手前の HTTP の層で
 * 弾くしかない。
 *
 * ここが先に走ることはソースで確認済み: Nitro は `server/middleware/` の handler を
 * h3 の stack へ `h3App.use()` で積み、route handler を持つ router を**その後で**
 * 積む（`nitropack/dist/runtime/internal/app.mjs`）。モジュールの受け口は
 * `addServerHandler({ route })` で登録される route handler で（`@nuxtjs/mcp-toolkit/dist/module.mjs`
 * の `registerServerHandlers`）、ビルド出力でも `{ route: '/mcp', middleware: false }` になる
 * （`.nuxt/dev/index.mjs` の handlers）。middleware の並び順に関わらず router より先である。
 */

/**
 * モジュールが JSON-RPC を受ける route。`@nuxtjs/mcp-toolkit` の既定の `/mcp` で、
 * `nuxt.config.ts` は `route` を指定していない（呼ぶ側も `${apiBaseUrl}/mcp` を組み立てる
 * ——`server/utils/stroke/invoke.ts`）。
 *
 * 末尾スラッシュ付きも同じ受け口へ入るので併せて対象にする（radix3 の `lookup('/mcp/')` が
 * route `/mcp` を返す・実測）。`/mcp/deeplink` と `/mcp/badge.svg` はツール呼び出しではないので
 * 対象にしない。
 */
const MCP_ENDPOINT_PATHS = new Set(['/mcp', '/mcp/'])

export default defineEventHandler((event) => {
  // `event.path` はクエリを含む（h3 の `_decodePath` はクエリを付けたまま返す）ので落とす
  const queryAt = event.path.indexOf('?')
  const path = queryAt === -1 ? event.path : event.path.slice(0, queryAt)
  if (!MCP_ENDPOINT_PATHS.has(path)) return

  // 解決した接続文脈はここでは使わない。ツールハンドラ側が `extra.requestInfo.headers` から
  // 改めて解決する（`server/utils/mcp/connection-table.ts`）。照合が二重になるのは意図で、
  // ハンドラ側は接続文脈そのものを要るために引いている。
  //
  // **401 を throw するのはここだけ。** `resolveConnection` は結果で返す（ツールハンドラの
  // 中で throw すると結果の平坦形が崩れるため。理由は同関数の doc）。HTTP 401 を出せるのは
  // route handler より手前にいるこの層だけなので、失敗の文言をそのまま h3 の error に載せる。
  //
  // throw した h3 の 401 は Nitro の error handler が HTTP 401 の JSON にして返す。
  // `createError` で作った error は `unhandled` にならないので、`message` はそのまま本文に載る
  // （`nitropack/dist/runtime/internal/error/prod.mjs`）。
  const resolved = resolveConnection(getRequestHeaders(event))
  if (!resolved.ok) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: resolved.error,
    })
  }
})
