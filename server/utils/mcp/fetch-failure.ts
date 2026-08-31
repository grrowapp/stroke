import { FetchError } from 'ofetch'

export interface FetchFailure {
  status: number
  message: string
}

/**
 * status を持たない失敗に充てる、**こちらで組み立てたステータス**。
 *
 * 代行先の応答ではない（応答が無いのだから、保持すべきステータスが存在しない）。
 * `upstream-failure.ts` の `upstream_malformed` が実ステータスを持てないときに 502 を
 * 置いているのと同じ扱いで、語彙を揃えてある。
 *
 * どのツールもこの値を `errorCode` の写像に持たないので、結果は全ツール一律で
 * `unexpected_status` になる。専用の `errorCode` を足さないのは、写像を持つのが
 * ツール側であり、編集の届かないツールとの間で**同じ状況に別々の `errorCode` が
 * 割り当たる**のを避けるため（specs `mcp/server`「同じ状況には全ツールで同じ
 * `errorCode` を使う」）。
 */
const NO_RESPONSE_STATUS = 502

/**
 * `$fetch` が投げる失敗から `{status, message}` を取り出す。
 *
 * `message` は endpoint が返したエラー本文（`error.data.message`）で、書き換え・省略・
 * 追加をしない（specs `mcp/server`「エラー本文を書き換え・省略・追加してはならない」）。
 *
 * **status を持たない失敗（`FetchError` ではない・接続そのものが成立しない等）でも
 * 投げ返さない。** 投げるとツールハンドラの外へ抜け、モジュールの
 * `normalizeErrorToResult` が `isError: true` のテキストへ畳むので、結果が `status` も
 * `errorCode` も `error` も持たなくなる——specs `mcp/server`「各ツールの結果は1階層とし、
 * 常に `status` を持つ」、specs `mcp/tools/submit`「例外を投げて結果の形を崩しては
 * ならない」に反する（santa-method レビュー指摘 3周目 2026-08-30）。
 * 代わりに `NO_RESPONSE_STATUS` と例外のメッセージを返し、呼び出し側がいつもの平坦な
 * エラー結果に整形できるようにする。
 *
 * stroke-board 自身の endpoint は同一プロセスで常に到達でき（design.md「unreachable を
 * 定めるのは本家 dashboard 向け操作だけ」）、Nitro の `$fetch` は相対パスの発行で常に
 * status 付きの `FetchError` を作るため、この分岐に来る具体的な引き金は見つかっていない。
 * 平坦形式の保証を**構造として**持たせるためのものである。
 */
export function readFetchFailure(error: unknown): FetchFailure {
  if (!(error instanceof FetchError) || error.status === undefined) {
    return {
      status: NO_RESPONSE_STATUS,
      message: error instanceof Error ? error.message : String(error),
    }
  }

  const data = error.data as { message?: unknown } | undefined
  const message = typeof data?.message === 'string' ? data.message : error.message

  return { status: error.status, message }
}
