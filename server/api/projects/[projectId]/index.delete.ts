import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { Phase } from '#shared/stroke'
import { DeleteError, isSafeSegment, removeTarget } from '../../../handler/delete'
import { readStrokeConfig } from '../../../utils/stroke/config'
import { conflict } from '../../../utils/stroke/conflict'
import { isRunning, projectRunPath } from '../../../utils/stroke/running'
import { readState, type SessionState } from '../../../utils/stroke/session-store'
import { deriveProjectId } from '../../../utils/upstream/project-id'

/**
 * プロジェクトを消す（`openspec/specs/api/project/delete`）。
 *
 * **メソッドで振り分ける。** パスに `delete` という動詞を置かず、
 * `DELETE /api/projects/:projectId` とする。メソッドを絞らない handler にすると、削除が
 * `GET` でも到達できてしまう。
 *
 * **消せるのは承認以降のものだけである。** まだプロジェクトになっていないセッションは
 * ここでは受理しない——セッションの削除が扱う。
 *
 * **完成したプロジェクト（`activated`）は消さない。** それは steering が文書を出し終え、
 * レビューできる状態に達した実体で、この口が扱う対象ではない。この口は「作りきれずに
 * 終わったもの」を片付けるためにある。**根拠は phase であって `.spec-workflow/` の有無では
 * ない**——そのディレクトリは生成（P2）の依頼を本家が受理したときにでき、AI が起動する前から
 * 在るので、作りきれなかったプロジェクトも持っている。有無で断ると、失敗の決着で「破棄する」を選んだものが消せず一覧に居座る
 * （add-activated-phase design D5）。
 *
 * つまりこの口が消すのは `approved` だけである（下の `DELETABLE`）。判定は endpoint が持ち、
 * 消す動作（`handler/delete`）は判定を持たない。phase は `readState`（zod）で読み、
 * **壊れた `state.json` は消さない**。
 *
 * 対象は `projectId` で指す。本家の id は workspace のパスから作られ、生成中の行は
 * その式で導出した値を持つ（`upstream/project-id.ts`）。id から名前を復元する手段は
 * ハッシュの性質上、**保存先を走査して導出値と突き合わせる**しかない。
 */

/** この口が消してよい局面。作りきれなかったもの（生成中）だけ */
const DELETABLE: readonly Phase[] = ['approved']

export default defineEventHandler(async (event): Promise<Response> => {
  const projectId = getRouterParam(event, 'projectId')
  if (projectId === undefined || projectId === '') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'projectId が無い。' })
  }

  const root = readStrokeConfig().projectShareRoot
  const name = await resolveName(root, projectId)
  if (name === null) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: `そのプロジェクトは無い: ${projectId}`,
    })
  }

  // busy 判定の単位は起動（U13）・セッションの削除（U11）・承認（U10）と同じ1つの事実
  // （作業場所ディレクトリの実体）——単位の定義は `running.ts` に集約してあり、
  // 口ごとに数え直さない（fix-rename-during-running-session）。
  if (await isRunning(projectRunPath(root, name))) {
    throw conflict('busy', 'このプロジェクトは AI の応答を待っている。完了するまで削除は受け付けない。')
  }

  let state: SessionState
  try {
    state = await readState(name)
  } catch {
    throw conflict('phase', 'state.json を読めない。分からないものは消さない。')
  }

  if (!DELETABLE.includes(state.phase)) {
    throw state.phase === 'activated'
      ? conflict('phase', '中身のあるプロジェクトはここでは消せない。')
      : conflict('phase', 'まだプロジェクトになっていない。セッションの削除を使うこと。')
  }

  try {
    await removeTarget(root, name)
  } catch (error) {
    throw toHttp(error)
  }

  return new Response(null, { status: 204 })
})

/**
 * `projectId` から保存先直下の名前を引く。
 *
 * ハッシュは戻せないので、直下を走査して**導出値が一致するもの**を探す。件数は保存先の
 * 直下の数だけで、走査そのものは一覧の組み立てでも毎回行っている規模である。
 */
async function resolveName(root: string | null, projectId: string): Promise<string | null> {
  if (root === null) return null

  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return null
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeSegment(entry.name)) continue
    if (deriveProjectId(join(root, entry.name)) === projectId) return entry.name
  }

  return null
}

function toHttp(error: unknown) {
  if (error instanceof DeleteError && error.kind === 'not-found') {
    return createError({ statusCode: 404, statusMessage: 'Not Found', message: error.message })
  }
  return createError({
    statusCode: 500,
    statusMessage: 'Internal Server Error',
    message: error instanceof Error ? error.message : String(error),
  })
}
