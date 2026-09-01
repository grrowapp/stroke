import { stat } from 'node:fs/promises'
import { conflict } from './conflict'
import { projectDir, sessionDir } from './paths'

/**
 * 作業場所ディレクトリの**実体**単位の実行中フラグ。
 *
 * 同じ物理ディレクトリに対して `claude -p` を並行起動すると履歴が壊れる。画面側も待機表示で
 * 送信を抑止するが、拒否の判断はサーバが持つ。単一ユーザー・単一プロセスの MVP なので
 * メモリ上で足りる。
 *
 * **キーは呼び出しに使われた id ではなく、作業場所ディレクトリの実体（`stat` の `dev`/`ino`
 * の組）である。** セッションの id は承認による昇格で uuid からプロジェクト名へ変わるが、
 * `rename(2)` は inode を保つので、改名の前後で同じディレクトリは同じキーになる。id を
 * そのままキーにすると、改名の前後で別の枠になり、同じ実体に対して2つの `claude -p` が
 * 別々のキーで同時に走れてしまう（fix-rename-during-running-session）。
 */
const running = new Set<string>()

/**
 * 作業場所ディレクトリの実体からキーを作る。導出はここだけに置く。
 *
 * `stat` に失敗したら（対象が消えている・権限が無い）そのまま投げる。既定値で補って
 * 別のキーに落ちる経路は作らない——枠を取り違えるくらいなら、枠を取れない方がまし
 * （design.md Risks）。
 */
async function keyOf(path: string): Promise<string> {
  const stats = await stat(path)
  return `${stats.dev}:${stats.ino}`
}

/** セッション id（保存先の下、改名前の実体）が指す作業場所のパス。 */
export function sessionRunPath(root: string, sessionId: string): string {
  return sessionDir(root, sessionId)
}

/** プロジェクト名（保存先の下、改名後の実体）が指す作業場所のパス。 */
export function projectRunPath(root: string, name: string): string {
  return projectDir(root, name)
}

/**
 * 実行中フラグを立てる。既に実行中なら 409 を投げる（呼び出し側は何も変えていない状態で
 * 戻ることになる）。
 *
 * `path` から `stat` でキーを引くため非同期になる。**返すキーを `endRun` に渡すこと。**
 * `endRun` はこのキーで解放するので、実行中に対象のディレクトリが改名・削除されても
 * （`stat` し直さずに済むため）確実に外せる。
 */
export async function beginRun(path: string): Promise<string> {
  const key = await keyOf(path)
  if (running.has(key)) {
    throw conflict('busy', 'この作業場所は AI の応答を待っている。完了するまで新しい起動は受け付けない。')
  }
  running.add(key)
  return key
}

/** `beginRun` が返したキーで実行中フラグを外す。 */
export function endRun(key: string): void {
  running.delete(key)
}

/**
 * その作業場所が実行中か。`path` から `stat` でキーを引くため非同期になる。
 *
 * 削除（U11・U13 の busy 判定・P1）・承認（U10）はここを通す。口ごとに別の単位で
 * 数え直すと、同じ物理ディレクトリが口によって別々の対象に見える状態を作ってしまう
 * （openspec/specs/api/session/invoke-agent「同一対象の多重起動を受け付けない」）。
 */
export async function isRunning(path: string): Promise<boolean> {
  return running.has(await keyOf(path))
}
