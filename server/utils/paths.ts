import { join } from 'node:path'

/**
 * セッションディレクトリの置き場。`claude -p` の cwd になる。
 * `/var/lib` は実行ユーザーでは書き込み不可なので、この配下の作成と所有権付与は
 * アプリ外の配置作業（docs/adr 参照）。起動時チェックは server/plugins/00.writable.ts。
 */
export const SESSIONS_ROOT = '/var/lib/stroke-board/sessions'

/** 承認時にプロジェクトのトップディレクトリを作る場所。 */
export const PROJECTS_ROOT = '/opt/projects'

/** セッション uuid からセッションディレクトリのパスを引く。 */
export function sessionDir(sessionId: string): string {
  return join(SESSIONS_ROOT, sessionId)
}

/** セッションディレクトリ内のファイル。 */
export function sessionFile(sessionId: string, name: string): string {
  return join(sessionDir(sessionId), name)
}

/** 生成されるプロジェクトのトップディレクトリ。 */
export function projectDir(name: string): string {
  return join(PROJECTS_ROOT, name)
}
