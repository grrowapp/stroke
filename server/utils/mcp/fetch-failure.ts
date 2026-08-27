import { FetchError } from 'ofetch'

export interface FetchFailure {
  status: number
  message: string
}

/**
 * `$fetch` が投げる失敗から `{status, message}` を取り出す。
 *
 * `message` は endpoint が返したエラー本文（`error.data.message`）で、書き換え・省略・
 * 追加をしない（specs `mcp/server`「エラー本文を書き換え・省略・追加してはならない」）。
 *
 * status を持たない失敗（接続そのものが成立しない等）は想定外として再送出する。
 * stroke-board 自身の endpoint は同一プロセスで常に到達できるため、この関数の対象は
 * 常に到達可能な代行先（design.md「unreachable を定めるのは本家 dashboard 向け操作だけ」）。
 */
export function readFetchFailure(error: unknown): FetchFailure {
  if (!(error instanceof FetchError) || error.status === undefined) throw error

  const data = error.data as { message?: unknown } | undefined
  const message = typeof data?.message === 'string' ? data.message : error.message

  return { status: error.status, message }
}
