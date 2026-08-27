import { randomBytes } from 'node:crypto'
import { createError } from 'h3'

/**
 * 接続表。
 *
 * MCP ツール呼び出しを、それを起こした claude の接続文脈に結びつける層
 * （specs `server/session-management`、design.md「接続の担保」）。
 *
 * flontier 工程の呼び出しは `sessionId`、steering 工程の呼び出しは `projectPath` を持つ。
 * 両方同時に持つ・どちらも持たない状態は無い（design.md「接続の担保」）。union で表し、
 * その排他性を型で強制する。
 * Nitro プロセスのメモリ上にのみ保持し、永続化しない。stroke-board の再起動で
 * 全エントリが失効し、再起動をまたいで有効な token を作らない。
 */
export type ConnectionContext =
  | { sessionId: string, projectPath?: never }
  | { sessionId?: never, projectPath: string }

/**
 * `@nuxtjs/mcp-toolkit@0.19.0` のツールハンドラは `(args, extra)` を受け、`extra` は MCP SDK の
 * `RequestHandlerExtra` である（`event: H3Event` ではない。design.md の想定はモジュールの
 * 旧バージョンに基づくもので、実際にインストールされた版とは一致しない——ソース
 * `node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.d.ts` で確認済み）。
 * ヘッダは `extra.requestInfo.headers`（`RequestInfo['headers']`）から取れるので、
 * `resolveConnection` は H3Event ではなくこの形を受け取る。
 */
export type ConnectionHeaders = Record<string, string | string[] | undefined>

const connections = new Map<string, ConnectionContext>()

/** 推測困難な一時 token を発行する。登録はしない（呼び出し側が `registerConnection` する）。 */
export function issueConnectionToken(): string {
  return randomBytes(32).toString('hex')
}

/** token → 接続文脈を登録する。invoke.ts が spawn 直前に呼ぶ。 */
export function registerConnection(token: string, context: ConnectionContext): void {
  connections.set(token, context)
}

/** 登録を消す。invokeAi の実行終了時（正常・異常とも）に呼ぶ。 */
export function removeConnection(token: string): void {
  connections.delete(token)
}

/**
 * `x-stroke-token` ヘッダを接続表と照合し、接続文脈を解決する。
 *
 * 欠落・不一致は 401 を throw する。既定値で補わない（ADR-0013「API は暗黙の状態分岐を
 * 持たない」——ヘッダから読めない文脈を勝手に補うと、呼び出し元ごとに通る/通らないが
 * 変わる暗黙挙動になる）。
 */
export function resolveConnection(headers: ConnectionHeaders): ConnectionContext {
  const raw = headers['x-stroke-token']
  const token = Array.isArray(raw) ? raw[0] : raw
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'x-stroke-token ヘッダが無い。',
    })
  }

  const context = connections.get(token)
  if (context === undefined) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: '無効な token。',
    })
  }

  return context
}
