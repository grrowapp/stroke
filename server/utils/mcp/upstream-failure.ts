import { toHttpError } from '../control/upstream-proxy'
import type { UpstreamFailure } from '../upstream/rest'

export interface McpUnreachableFailure {
  status: 502
  errorCode: 'unreachable'
  error: string
}

export interface McpUpstreamErrorFailure {
  status: number
  errorCode: 'upstream_error'
  error: string
}

export type UpstreamCallFailure = McpUnreachableFailure | McpUpstreamErrorFailure

/**
 * 本家（upstream dashboard）への失敗を分類する。
 *
 * 「相手が拒否した」（本家は到達できて応答したが、対象が無い等の理由で失敗した。
 * `status` は本家の実際の応答を保持する）と「相手に届かない」（`unreachable`・502固定）を
 * 区別する（design.md「結果は status と errorCode のフラットな形に統一する」の Decision）。
 * `status` を常に本家の実応答にする（`unreachable` に潰さない）のは `mcp/server` の
 * 「status は endpoint の応答の HTTP ステータスコードを保持する」SHALL による
 * （santa-method レビュー指摘）。
 */
export function describeUpstreamFailure(failure: UpstreamFailure): UpstreamCallFailure {
  // not-found: 本家が到達できて「無い」と答えた——拒否側。他の kind
  // （not-configured / unreachable / malformed）は環境側の問題で不到達側。
  if (failure.kind === 'not-found') {
    // `detail` は本家が返したエラー本文（rest.ts の `detailOf`）。取れているならそれを
    // 使う——`toHttpError` の固定文言（'対象が見つからない'）で埋めると、エラー本文を
    // 書き換えないという mcp/server の MUST NOT に反する（santa-method レビュー指摘）。
    const error = failure.detail ?? toHttpError(failure).message ?? '対象が見つからない'
    return { status: 404, errorCode: 'upstream_error', error }
  }

  const error = toHttpError(failure).message ?? '本家に繋がらない。'
  return { status: 502, errorCode: 'unreachable', error }
}
