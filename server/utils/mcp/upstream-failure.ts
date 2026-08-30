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

/**
 * 本家が 400 で拒否した——渡した引数が本家の契約を満たしていない。
 *
 * `upstream_error` に混ぜない。`upstream-fetch.ts` の `classifySteeringFailure` は本家の
 * 400 を `validation_error` に写しており、混ぜると**同じ状況（本家の 400）に2つの
 * `errorCode`** が付く。`get-steering` は1回の実行で両方の経路を通る（文書取得は
 * `upstreamFetch` → `classifySteeringFailure`、`/info` は `UpstreamRestClient` →
 * この関数）ので、割れは構造として残り続ける（specs `mcp/server`「同じ状況には全ツールで
 * 同じ `errorCode` を使う」SHALL。santa-method レビュー指摘 5周目 2026-08-30）。
 */
export interface McpValidationFailure {
  status: 400
  errorCode: 'validation_error'
  error: string
}

/**
 * 本家は到達できて 2xx で応答したが、そのペイロードがこちらのスキーマに合わなかった。
 *
 * **`unreachable` と混ぜない。** 混ぜると、稼働中の本家に対して「届かない」と報告して
 * しまい、受け手が「環境の問題（出し直しても無駄）」と誤診する。実際は「本家の形が
 * 変わった＝こちらのスキーマを直す」問題である（santa-method レビュー指摘 2026-08-30）。
 *
 * `status` が 502 固定なのは、`rest.ts` の `malformed` が本家の実ステータスを持って
 * いないため。`read` は 2xx のときしか `malformed` を作らないので実際は 200 系だが、
 * その値は失敗に載っていない。捏造せず、`upstream-proxy.ts` が画面向けに使っている
 * 写像（malformed → 502 `upstream-malformed`）と語彙を揃えて 502 を置く。
 * 区別は `errorCode` が担う。
 */
export interface McpUpstreamMalformedFailure {
  status: 502
  errorCode: 'upstream_malformed'
  error: string
}

export type UpstreamCallFailure =
  | McpUnreachableFailure
  | McpUpstreamErrorFailure
  | McpUpstreamMalformedFailure
  | McpValidationFailure

/**
 * 本家（upstream dashboard）への失敗を分類する。
 *
 * 4つに分ける（design.md「結果は status と errorCode のフラットな形に統一する」の Decision）:
 *
 * - 「相手が引数を拒否した」——本家が 400 で返した。`validation_error`。
 *   `upstream-fetch.ts` の `classifySteeringFailure` と同じ判定・同じ値にする
 * - 「相手が拒否した」——本家は到達できて応答したが、対象が無い・本家の内部エラー等の
 *   理由で失敗した。`upstream_error`。`status` は本家の実際の応答を保持する
 * - 「相手の答えの形が違う」——本家は 2xx で応答したが、こちらのスキーマに合わなかった。
 *   `upstream_malformed`。直すのはこちらのスキーマで、環境の問題ではない
 * - 「相手に届かない」——`unreachable`・502固定。未設定と接続不可だけがここに入る
 *
 * `status` を本家の実応答にする（`unreachable` に潰さない）のは `mcp/server` の
 * 「status は endpoint の応答の HTTP ステータスコードを保持する」SHALL による
 * （santa-method レビュー指摘）。
 */
export function describeUpstreamFailure(failure: UpstreamFailure): UpstreamCallFailure {
  // not-found / error-response: 本家が到達できて答えた——拒否側。実ステータスを保持する。
  // malformed も本家は答えている（`rest.ts` の `read` が 2xx の後段で作る）が、実ステータスが
  // 失敗に載っていないので専用の errorCode で分ける。真に不到達なのは残る2つ
  // （not-configured / unreachable）だけである。
  if (failure.kind === 'error-response') {
    // `detail`（本家のエラー本文）が取れているならそれを、無ければ発行時のメッセージを
    // 使う。`upstream-fetch.ts` の `classifySteeringFailure` と同じ組み立てで、
    // 同じツールの中で 500 の解釈が割れないようにする。
    const error = failure.detail ?? failure.reason
    // 400 だけは `validation_error` に分ける（理由は `McpValidationFailure`）。
    if (failure.status === 400) {
      return { status: 400, errorCode: 'validation_error', error }
    }
    return { status: failure.status, errorCode: 'upstream_error', error }
  }

  if (failure.kind === 'not-found') {
    // `detail` は本家が返したエラー本文（rest.ts の `detailOf`）。取れているならそれを
    // 使う——`toHttpError` の固定文言（'対象が見つからない'）で埋めると、エラー本文を
    // 書き換えないという mcp/server の MUST NOT に反する（santa-method レビュー指摘）。
    const error = failure.detail ?? toHttpError(failure).message ?? '対象が見つからない'
    return { status: 404, errorCode: 'upstream_error', error }
  }

  if (failure.kind === 'malformed') {
    // 到達している。`unreachable` へ落とさず `upstream_malformed` で返す——受け手が
    // 「環境の問題」と「本家の形が変わった」を取り違えないようにするため。
    const error = toHttpError(failure).message ?? '本家のペイロードが想定と違う。'
    return { status: 502, errorCode: 'upstream_malformed', error }
  }

  // 残る2つ（not-configured / unreachable）。文言は `toHttpError` のものをそのまま使う
  // ——未設定は `本家ダッシュボードの URL が設定されていない`、接続不可は
  // `本家に繋がらない: <理由>`。もう一方の経路（`upstream-fetch.ts` の
  // `classifySteeringFailure`）もこの2つに揃えてある（santa-method レビュー指摘 7周目）
  const error = toHttpError(failure).message ?? '本家に繋がらない。'
  return { status: 502, errorCode: 'unreachable', error }
}
