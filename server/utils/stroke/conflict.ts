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
