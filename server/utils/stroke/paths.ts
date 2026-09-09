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

/** セッションディレクトリ内のファイル。名前は下の `SESSION_FILES`。 */
export function sessionFile(root: string, sessionId: string, name: string): string {
  return join(sessionDir(root, sessionId), name)
}

/**
 * セッションディレクトリ内のファイル名。中身の書式とセットで決まるものなので、
 * 名前だけを外から差し替えられる意味がない。設定ではない
 * （docs/specs/core/settings-reference.md）。
 */
export const SESSION_FILES = {
  state: 'state.json',
  strokes: 'strokes.json',
  overview: 'overview.txt',
  sendBack: 'send-back.json',
} as const

/**
 * 保存先の直下の1つとして、ディレクトリ名にそのまま使える形か。
 *
 * 対象の id は昇格でプロジェクト名に変わるので、uuid の形では絞れない。代わりに
 * **保存先の外へ出られる形を通さない**ことだけを見る。`project.ts` の
 * `assertProjectName` と同じ線引きで、緩めれば保存先の外を読み書きできてしまう。
 *
 * path を組み立てる前に名前を見るものなので、組み立てと同じここに置く。**この判定は
 * 1 つである**——handler（`server/handler/delete.ts`・`session.ts`）も endpoint も
 * CLI も、ここを呼ぶ。
 */
export function isSafeSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes('..')
}

/** 昇格したプロジェクトのトップディレクトリ。セッションと同じ親の下に在る。 */
export function projectDir(root: string, name: string): string {
  return join(root, name)
}
