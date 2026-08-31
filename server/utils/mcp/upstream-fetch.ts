import { FetchError, ofetch } from 'ofetch'
import type { z } from 'zod'

import { readServerConfig } from '../config'
import type { UpstreamCallFailure } from './upstream-failure'

/**
 * 本家が 2xx で応答したが、本文が想定の形と違い結果を組み立てられない。
 *
 * `unreachable`（届かない）と混ぜない。混ぜると、稼働中の本家に対して「届かない」と
 * 報告してしまう（`upstream-failure.ts` の `McpUpstreamMalformedFailure` と同じ理由）。
 * 文言は画面側の写像（`upstream-proxy.ts` の `malformed`）と揃えてある。
 */
export class UpstreamMalformedError extends Error {
  constructor(reason: string) {
    super(`本家のペイロードが想定と違う: ${reason}`)
    this.name = 'UpstreamMalformedError'
  }
}

/**
 * 本家 URL が設定されていない。発行する前に落とす。
 *
 * 接続不可（`本家に繋がらない: <reason>`）と**文言が違う**ので、分類でも区別できる形に
 * しておく。`classifySteeringFailure` の受け皿は同じ `unreachable` だが、そこで一律に
 * 接続不可の文言を被せると未設定の説明が消える（`describeUpstreamFailure` も
 * `not-configured` と `unreachable` を別の文言で返している）。
 *
 * 文言は `upstream-proxy.ts` の `toHttpError`（not-configured）と同一にする——
 * `get-steering` は1回の実行でこちらと `describeUpstreamFailure` の両方を通りうるので、
 * 同じ原因の `error` が割れると受け手が別の失敗と読む（santa-method レビュー指摘 6周目）。
 */
export class UpstreamNotConfiguredError extends Error {
  constructor() {
    super('本家ダッシュボードの URL が設定されていない')
    this.name = 'UpstreamNotConfiguredError'
  }
}

/**
 * 本家 dashboard へ直接発行し、**応答ステータスと検証済みの本文の両方**を持ち帰る。
 *
 * `UpstreamRestClient`（server/utils/upstream/rest.ts）は本家の応答を正規化した形
 * （`UpstreamFailure`）に畳むためのもので、MCP ツールが必要とする「本家の応答をそのまま
 * 返す」（design.md「本家の応答をツール側で変換してはならない」）とは目的が逆になる。
 * ここでは失敗を畳まず、`ofetch.raw` で受けた実ステータスをそのまま呼び出し側へ渡す
 * （`mcp/server`「代行先が応答を返したなら、その status を保持する」SHALL）。
 *
 * ただし**本文の形は検証する**。素の `ofetch` で本文だけを受けていた間、本家が 2xx で
 * 返した想定外の本文（空ボディ・HTML・別の形の JSON）が素通りし、`{ status: 200 }` の
 * 成功として組み立てられていた。`get-steering` ではこれが「文書がまだ無い（空の本文）」
 * と見分けの付かない結果になり、上書きによる文書消失の経路になる（santa-method レビュー
 * 指摘 2026-08-30）。`mcp/server` の例外表「代行先は応答したが、本文が想定の形と違い
 * 結果を組み立てられない → status: 502 / errorCode: upstream_malformed」に沿って、
 * 形が合わなければ `UpstreamMalformedError` を投げる。検証の書き方は `rest.ts` の
 * `read` に倣う。
 *
 * `schema` を省ける形にしないのは、渡し忘れがそのまま無検証に戻るからである。本文を
 * 使わない発行（PUT）は `z.unknown()` を明示的に渡して「検証しない」と書く。
 */
export async function upstreamFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: { method?: 'GET' | 'PUT', body?: Record<string, unknown> },
): Promise<{ status: number, data: T }> {
  const { upstreamBaseUrl } = readServerConfig()
  if (upstreamBaseUrl === null) {
    // 文言と、接続不可と混ぜない理由は `UpstreamNotConfiguredError` に書いた。
    throw new UpstreamNotConfiguredError()
  }

  const response = await ofetch.raw<unknown>(path, {
    baseURL: upstreamBaseUrl,
    method: options?.method,
    body: options?.body,
    retry: 0,
  })

  // 204 のような本文の無い応答では `_data` が undefined になる（ofetch の
  // `nullBodyResponses`）。`z.unknown()` はそれも通すので、本文を使わない発行は
  // ここで弾かれない。
  const parsed = schema.safeParse(response._data)
  if (!parsed.success) {
    throw new UpstreamMalformedError(parsed.error.message)
  }

  return { status: response.status, data: parsed.data }
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
 * - 本家は 2xx で応答したが本文の形が違うものは `upstream_malformed`（502固定）。
 *   `status` が 502 固定なのは `mcp/server` の例外表がその値を規定しているため
 * - 応答そのものが無い失敗（未設定・接続不可）は `unreachable`（502固定）
 *
 * 「相手が拒否した」「相手の答えの形が違う」「相手に届かない」を区別する（design.md の
 * Decision。santa-method レビュー指摘で全失敗を unreachable に潰していたのを修正）。
 *
 * **`unreachable` の `error` は `describeUpstreamFailure` と同じ文言にする。**
 * 未設定は `本家ダッシュボードの URL が設定されていない`、接続不可は
 * `本家に繋がらない: <理由>`——いずれも `upstream-proxy.ts` の `toHttpError` の語彙である。
 * `get-steering` は1回の実行で両方の経路を通りうる（文書取得はこちら、`/info` は
 * `UpstreamRestClient` → `describeUpstreamFailure`）ので、同じ原因の `error` が割れると
 * 受け手が別の失敗と読む。**素の例外メッセージ側ではなく `toHttpError` の語彙へ寄せる**
 * のは、この2経路のうち写像を1本しか持たないのがこちらだからで、未設定・形違いの文言も
 * 既にそちらへ揃えてある（santa-method レビュー指摘 7周目 2026-08-30）。
 */
export function classifySteeringFailure(error: unknown): SteeringToolFailure {
  if (error instanceof UpstreamMalformedError) {
    return { status: 502, errorCode: 'upstream_malformed', error: error.message }
  }
  if (error instanceof UpstreamNotConfiguredError) {
    return { status: 502, errorCode: 'unreachable', error: error.message }
  }
  if (error instanceof FetchError && error.status !== undefined) {
    if (error.status === 400) {
      return { status: 400, errorCode: 'validation_error', error: upstreamErrorMessage(error) }
    }
    return { status: error.status, errorCode: 'upstream_error', error: upstreamErrorMessage(error) }
  }
  // 接続不可。`describeUpstreamFailure`（`toHttpError` の unreachable）と同じ組み立て。
  return { status: 502, errorCode: 'unreachable', error: `本家に繋がらない: ${upstreamErrorMessage(error)}` }
}
