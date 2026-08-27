import { FetchError, ofetch } from 'ofetch'

import { readServerConfig } from '../config'
import type { UpstreamCallFailure } from './upstream-failure'

/**
 * 本家 dashboard へ直接発行する。
 *
 * `UpstreamRestClient`（server/utils/upstream/rest.ts）は本家の応答を正規化した形
 * （`UpstreamFailure`）に畳むためのもので、MCP ツールが必要とする「本家の応答をそのまま
 * 返す」（design.md「本家の応答をツール側で変換してはならない」）とは目的が逆になる。
 * ここでは正規化せず、素の `ofetch` を使う。
 */
export async function upstreamFetch<T>(
  path: string,
  options?: { method?: 'GET' | 'PUT', body?: Record<string, unknown> },
): Promise<T> {
  const { upstreamBaseUrl } = readServerConfig()
  if (upstreamBaseUrl === null) {
    throw new FetchError('本家ダッシュボードの URL が設定されていない。')
  }
  return await ofetch<T>(path, {
    baseURL: upstreamBaseUrl,
    method: options?.method,
    body: options?.body,
    retry: 0,
  })
}

export type SteeringToolFailure =
  | { status: 400, errorCode: 'validation_error', error: string }
  | UpstreamCallFailure

function upstreamErrorMessage(error: unknown): string {
  if (error instanceof FetchError) {
    const data = error.data as { error?: unknown } | undefined
    return typeof data?.error === 'string' ? data.error : error.message
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * steering 系ツール共通の失敗分類。
 *
 * - 本家が 400 で返す文書名エラーは `validation_error`
 * - 本家から実際に応答があった他の失敗（4xx/5xx）は `upstream_error`。`status` は本家の
 *   実応答をそのまま持つ（`mcp/server`「status は endpoint の応答の HTTP ステータス
 *   コードを保持する」SHALL）
 * - 応答そのものが無い失敗（未設定・接続不可）は `unreachable`（502固定）
 *
 * 「相手が拒否した」と「相手に届かない」を区別する（design.md の Decision。
 * santa-method レビュー指摘で全失敗を unreachable に潰していたのを修正）。
 */
export function classifySteeringFailure(error: unknown): SteeringToolFailure {
  if (error instanceof FetchError && error.status !== undefined) {
    if (error.status === 400) {
      return { status: 400, errorCode: 'validation_error', error: upstreamErrorMessage(error) }
    }
    return { status: error.status, errorCode: 'upstream_error', error: upstreamErrorMessage(error) }
  }
  return { status: 502, errorCode: 'unreachable', error: upstreamErrorMessage(error) }
}
