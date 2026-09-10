import { DeleteError } from '../../handler/delete'

/**
 * api の後始末——handler の失敗を HTTP へ写す語彙。
 *
 * ここに置くのは endpoint が2つ以上で共有するものだけである。同じ写しが endpoint ごとに
 * 並ぶと、同じ失敗が口によって違う status になりうる。
 */

/**
 * 409 の理由。
 *
 * サーバは3つの理由で 409 を返すが、どれも同じ status なので画面から区別できない。
 * 理由の印を `data.reason` に載せ、画面が出すもの（名前を変えさせる／待たせる／
 * 画面を作り直す）を選べるようにする。
 */
export type ConflictReason =
  /** `/opt/projects/<name>` が既にある。別の名前なら通る */
  | 'name-conflict'
  /** そのセッションで `claude -p` が実行中。待てば通る */
  | 'busy'
  /** その操作が今の phase に当てはまらない。画面が持っている状態が古い */
  | 'phase'

/** 409 を、画面が理由を読める形で作る。 */
export function conflict(reason: ConflictReason, message: string) {
  return createError({
    statusCode: 409,
    statusMessage: 'Conflict',
    message,
    data: { reason },
  })
}

/**
 * 消す実行（`server/handler/delete.ts`）の失敗を HTTP へ写す。
 *
 * 対象が無いのは 404、それ以外（I/O）は 500。同じ実行の同じ失敗なので、口ごとに写しを
 * 持たない。局面の判定（消してよい局面か）はここへ来る前に endpoint が済ませている。
 *
 * **呼び手はセッションの削除（U11）とプロジェクトの削除（P1）の2つである。**
 * P1 が持っていた同じ写しは `update-project-api-handler` で消し、両方がここを呼ぶ形に揃えた。
 */
export function deleteErrorToHttp(error: unknown) {
  if (error instanceof DeleteError && error.kind === 'not-found') {
    return createError({ statusCode: 404, statusMessage: 'Not Found', message: error.message })
  }
  return createError({
    statusCode: 500,
    statusMessage: 'Internal Server Error',
    message: error instanceof Error ? error.message : String(error),
  })
}
