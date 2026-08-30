import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Phase } from '#shared/stroke'

/**
 * 承認より前か、以降か。
 *
 * セッションとプロジェクトは同じ保存先に並び、`state.json` の `phase` だけが両者を分ける。
 * 削除の口は2つあり、**どちらを許すかだけが違う**。その線引きをここに1つ書き、
 * どちらを使うかは呼ぶ側（各 endpoint）が選ぶ。
 *
 * 判定の中身を1箇所に置くのは、局面が増えたとき（`approved` の先に何か足すなど）に
 * 直す場所を1つにするためである。選択を呼ぶ側に残すのは、実行や判定が「誰から呼ばれたか」を
 * 知らずに済むようにするためである。
 */

/** 承認より前。まだプロジェクトになっていない */
export function isBeforeApproval(phase: Phase): boolean {
  return phase === 'stroking' || phase === 'proposed'
}

/** 承認以降。もうプロジェクトである */
export function isAfterApproval(phase: Phase): boolean {
  return phase === 'approved'
}

/**
 * `state.json` の `phase` を読む。読めない・知らない値なら null。
 *
 * 削除の判定に使うので、**分からないものを通さない**。null を「許す」に倒すと、
 * 壊れた `state.json` を持つ本物のプロジェクトが消せてしまう。
 */
export async function readPhase(root: string, name: string): Promise<Phase | null> {
  try {
    const raw = JSON.parse(await readFile(join(root, name, 'state.json'), 'utf8'))
    const phase = raw?.phase
    return phase === 'stroking' || phase === 'proposed' || phase === 'approved' ? phase : null
  } catch {
    return null
  }
}
