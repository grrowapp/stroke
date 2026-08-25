import { join } from 'node:path'

/**
 * 保存先からパスを組み立てる。
 *
 * 設定を引かない。保存先（`projectShareRoot`）は呼び出し側が解決して渡す
 * （docs/specs/core/settings-reference.md「設定を引くのは端だけである」）。自分で引くと、
 * endpoint（Nitro）と CLI（tsx）で引く経路が割れる。
 *
 * セッションとプロジェクトは**同じ親**の下に並ぶ。承認はこの親の下での改名だけで
 * 昇格を行うため、`sessionDir()` と `projectDir()` は同じ `root` から組み立てる
 * （openspec/specs/project/generation）。
 */

/** セッション uuid からセッションディレクトリのパスを引く。 */
export function sessionDir(root: string, sessionId: string): string {
  return join(root, sessionId)
}

/** セッションディレクトリ内のファイル。名前は `session-core.ts` の `SESSION_FILES`。 */
export function sessionFile(root: string, sessionId: string, name: string): string {
  return join(sessionDir(root, sessionId), name)
}

/** 昇格したプロジェクトのトップディレクトリ。セッションと同じ親の下に在る。 */
export function projectDir(root: string, name: string): string {
  return join(root, name)
}
