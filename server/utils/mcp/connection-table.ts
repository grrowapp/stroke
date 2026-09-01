import { randomBytes } from 'node:crypto'

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
 * `x-stroke-token` ヘッダから接続文脈を解決できなかった。
 *
 * **代行先の応答ではなくここで組み立てた値である。** どの接続の呼び出しかが決まらず、
 * 代行先そのものが決まらないので、保持すべき応答が存在しない。`require-connection.ts` の
 * `ConnectionPhaseMismatchFailure`・`resolve-project-id.ts` の `ProjectNotRegisteredFailure`
 * と同じ扱いになる。
 */
export interface ConnectionUnauthorizedFailure {
  status: 401
  errorCode: 'unauthorized'
  error: string
}

export type ConnectionResolution =
  | { ok: true, context: ConnectionContext, token: string }
  | ({ ok: false } & ConnectionUnauthorizedFailure)

const TOKEN_MISSING = 'x-stroke-token ヘッダが無い。'
const TOKEN_UNKNOWN = '無効な token。'

/**
 * `x-stroke-token` ヘッダを接続表と照合し、接続文脈を解決する。
 *
 * 欠落・不一致は 401 の失敗として返す。既定値で補わない（ADR-0014「API は暗黙の状態分岐を
 * 持たない」——ヘッダから読めない文脈を勝手に補うと、呼び出し元ごとに通る/通らないが
 * 変わる暗黙挙動になる）。
 *
 * **throw ではなく結果で返す。** ここはツールハンドラの中から呼ばれるので、throw すると
 * モジュールの `normalizeErrorToResult` が `isError: true` のテキストへ畳んでしまい、
 * `status` も `errorCode` も持たない結果になる——specs `mcp/server`「各ツールの結果は
 * 1階層とし、常に `status` を持つ」（無条件）に反する。`require-connection.ts` が throw を
 * 全廃したのと同じ理由で、ここも平坦なエラーへ倒す（santa-method レビュー指摘 4周目
 * 2026-08-30）。
 *
 * 「有効な token を持たないツール呼び出しは HTTP 401 で拒否する」（specs
 * `server/session-management`）は `/mcp` の middleware（`server/middleware/mcp-token.ts`）が
 * 担う。middleware はこの結果を見て自分で 401 を throw する——HTTP の層で弾けるのは
 * ツールハンドラより手前にいるからで、理由は同ファイルの冒頭に書いた。
 * ここでの解決は多重防御と、接続文脈そのものの解決のためで、呼ぶのをやめると
 * 工程の識別ができなくなる。
 */
export function resolveConnection(headers: ConnectionHeaders): ConnectionResolution {
  const raw = headers['x-stroke-token']
  const token = Array.isArray(raw) ? raw[0] : raw
  if (!token) {
    return { ok: false, status: 401, errorCode: 'unauthorized', error: TOKEN_MISSING }
  }

  const context = connections.get(token)
  if (context === undefined) {
    return { ok: false, status: 401, errorCode: 'unauthorized', error: TOKEN_UNKNOWN }
  }

  return { ok: true, context, token }
}
