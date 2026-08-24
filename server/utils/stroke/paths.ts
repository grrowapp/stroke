import { join } from 'node:path'
import { resolveProjectsRoot, resolveSessionsRoot } from './settings'

/**
 * 置き場からパスを組み立てる。
 *
 * 値そのもの（置き場の既定値・解決関数・検査）は持たない。出どころは `settings.ts` 1本で、
 * endpoint（Nitro）もサーバを介さない CLI（`yarn session`）も同じそこを通る。だから経路で
 * 値が割れない（specs/configuration「実行経路が違っても同じ値に解決される」）。
 *
 * 解決は呼び出しのたびに行う。値を持ち回るために関数の引数を増やさない。
 */

/** セッション uuid からセッションディレクトリのパスを引く。 */
export function sessionDir(sessionId: string): string {
  return join(resolveSessionsRoot(), sessionId)
}

/** セッションディレクトリ内のファイル。名前は `settings.ts` の `SESSION_FILES`。 */
export function sessionFile(sessionId: string, name: string): string {
  return join(sessionDir(sessionId), name)
}

/** 生成されるプロジェクトのトップディレクトリ。 */
export function projectDir(name: string): string {
  return join(resolveProjectsRoot(), name)
}
