import fse from 'fs-extra'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { SESSION_FILES, isSafeSegment } from '../utils/stroke/paths'

/**
 * 保存先直下の1つを消す実行。
 *
 * セッションもプロジェクトも、消す動作そのものは同じである——保存先直下のディレクトリを
 * 中身ごと落とすだけ。違うのは**どの局面のものを消してよいか**で、それは呼ぶ側
 * （各 endpoint）が決める。ここは判定を持たない。
 *
 * **呼び出し元を知らせて分岐させない。** ここに「セッションから来たのか」を渡して条件を
 * 変えると、実行が呼び出し元を知ることになり、局面が増えるたびにここが太る。
 *
 * **消す実行はこの1本だけである。** endpoint（U11・P1）も CLI（`yarn session delete`）も
 * 検証の道具（`yarn check:stroke`）もここを通る。かつて `session-core.ts` に
 * `deleteSessionCore` / `removeSessionDir` という同じ実装が並んでいたが、
 * `update-session-api-handler` で畳んだ。
 */

export type DeleteErrorKind = 'not-found' | 'io'

export class DeleteError extends Error {
  constructor(
    public readonly kind: DeleteErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'DeleteError'
  }
}

/**
 * `state.json` が在ることをもって、対象として在るとする。
 *
 * **「在る」の定義はこの1つである。** 消す前の確認（U11・P1・CLI）も、セッションとして
 * 成立しているかの確認（`session-store.ts` の `sessionExists`）も同じものを見る。
 * 名前の形（保存先の外へ出られないこと）は `isSafeSegment` が見る（`utils/stroke/paths.ts`）。
 */
export async function targetExists(root: string, name: string): Promise<boolean> {
  if (!isSafeSegment(name)) return false
  try {
    return (await stat(join(root, name, SESSION_FILES.state))).isFile()
  } catch {
    return false
  }
}

/**
 * 消す。存在しない対象は消したことにしない。
 *
 * `fs-extra` の `remove` は存在しないパスで黙って成功するので、検査を先に置く。
 */
export async function removeTarget(root: string, name: string): Promise<void> {
  if (!(await targetExists(root, name))) {
    throw new DeleteError('not-found', `その対象は無い: ${name}`)
  }

  try {
    await fse.remove(join(root, name))
  } catch (error) {
    throw new DeleteError(
      'io',
      `消せなかった: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
