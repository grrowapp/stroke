import { stat } from 'node:fs/promises'
import { projectDir, sessionDir } from './paths'

/**
 * 作業場所ディレクトリの**実体**単位の実行中フラグ。
 *
 * 同じ物理ディレクトリに対して `claude -p` を並行起動すると履歴が壊れる。単一ユーザー・
 * 単一プロセスの MVP なのでメモリ上で足りる。
 *
 * **キーは呼び出しに使われた id ではなく、作業場所ディレクトリの実体（`stat` の `dev`/`ino`
 * の組）である。** セッションの id は承認による昇格で uuid からプロジェクト名へ変わるが、
 * `rename(2)` は inode を保つので、改名の前後で同じディレクトリは同じキーになる。id を
 * そのままキーにすると、改名の前後で別の枠になり、同じ実体に対して2つの `claude -p` が
 * 別々のキーで同時に走れてしまう（fix-rename-during-running-session design Decision 2）。
 *
 * **「実行中だから受け付けない」（409 busy）という応答は持たない。** 起動の要求は冪等で、
 * 対象が既に走っていればその要求は満たされている（openspec/specs/api/session/invoke-agent）。
 * ここが答えるのは「新しく起こしてよいか」だけで、断る理由は返さない。
 */
const running = new Set<string>()

/**
 * 作業場所ディレクトリの実体からキーを作る。導出はここだけに置く。
 *
 * `stat` に失敗したら（対象が消えている・権限が無い）そのまま投げる。既定値で補って
 * 別のキーに落ちる経路は作らない——枠を取り違えるくらいなら、枠を取れない方がまし
 * （design.md Decision 2）。
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
 * `beginRun` の結果。
 *
 * - `started: true` — 枠を取れた。`key` を `endRun` へ渡すこと
 * - `started: false` — その作業場所では既に実行が走っている。**失敗ではない**
 */
export type RunStart = { started: true, key: string } | { started: false }

/**
 * 実行の枠を取る。既に実行中なら `started: false` を返す。**投げない。**
 *
 * かつてここは 409 busy を投げていたが、「実行中だから受け付けない」という応答を契約から
 * 無くしたので、呼び出し側が自分の文脈で決める形にした（起動は冪等に受理し、削除・昇格は
 * そもそも実行中に届かない。fix-rename-during-running-session design Decision 4）。
 *
 * `path` から `stat` でキーを引くため非同期になる。**返すキーを `endRun` に渡すこと。**
 * `endRun` はこのキーで解放するので、実行中に対象のディレクトリが改名・削除されても
 * （`stat` し直さずに済むため）確実に外せる。
 */
export async function beginRun(path: string): Promise<RunStart> {
  const key = await keyOf(path)
  if (running.has(key)) return { started: false }
  running.add(key)
  return { started: true, key }
}

/** `beginRun` が返したキーで実行中フラグを外す。 */
export function endRun(key: string): void {
  running.delete(key)
}
