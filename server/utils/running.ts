import { conflict } from './conflict'

/**
 * セッション単位の実行中フラグ。
 *
 * 同じセッションに対して `claude -p` を並行起動すると履歴が壊れる。画面側も待機表示で
 * 送信を抑止するが、拒否の判断はサーバが持つ。単一ユーザー・単一プロセスの MVP なので
 * メモリ上で足りる。
 */
const running = new Set<string>()

/** 実行中フラグを立てる。既に実行中なら 409 を投げる。 */
export function beginRun(sessionId: string): void {
  if (running.has(sessionId)) {
    throw conflict('busy', 'このセッションは AI の応答を待っている。完了するまで追加の送信は受け付けない。')
  }
  running.add(sessionId)
}

export function endRun(sessionId: string): void {
  running.delete(sessionId)
}

export function isRunning(sessionId: string): boolean {
  return running.has(sessionId)
}
