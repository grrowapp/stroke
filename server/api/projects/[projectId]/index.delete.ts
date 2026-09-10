import type { Phase } from '#shared/stroke'
import { removeTarget } from '../../../handler/delete'
import { resolveProjectName } from '../../../handler/project-directory'
import { readStrokeConfig } from '../../../utils/stroke/config'
import { conflict, deleteErrorToHttp } from '../../../utils/stroke/conflict'
import { readState, type SessionState } from '../../../utils/stroke/session-store'

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
 * レビューできる状態に達した実体で、この endpoint が扱う対象ではない。ここが扱うのは
 * 「作りきれずに終わったもの」の片付けである。**根拠は phase であって `.spec-workflow/` の
 * 有無ではない**——そのディレクトリは生成（P2）の依頼を本家が受理したときにでき、AI が
 * 起動する前から在るので、作りきれなかったプロジェクトも持っている。有無で断ると、失敗の
 * 決着で「破棄する」を選んだものが消せず一覧に居座る（add-activated-phase design D5）。
 *
 * つまりこの endpoint が消すのは `approved` だけである（下の `DELETABLE`）。**どの局面を
 * 許すかはここが自分の literal で持ち**、消す動作（`handler/delete`）も名前を引く走査
 * （`handler/project-directory`）も判定を持たない。phase は `readState`（zod）で読み、
 * **壊れた `state.json` は消さない**。
 *
 * 対象は `projectId` で指す。本家の id は workspace のパスから作られ、生成中の行は
 * その式で導出した値を持つ（`upstream/project-id.ts`）。id から名前を復元する手段は
 * ハッシュの性質上、**保存先を走査して導出値と突き合わせる**しかない。
 */

/** この endpoint が消してよい局面。作りきれなかったもの（生成中）だけ */
const DELETABLE: readonly Phase[] = ['approved']

export default defineEventHandler(async (event): Promise<Response> => {
  const projectId = getRouterParam(event, 'projectId')
  if (projectId === undefined || projectId === '') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'projectId が無い。' })
  }

  const root = readStrokeConfig().projectShareRoot
  const name = await resolveProjectName(root, projectId)
  if (name === null) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: `そのプロジェクトは無い: ${projectId}`,
    })
  }

  // **実行中かどうかを見ない。** 画面が削除の操作を出す局面（生成の失敗の決着）は実行が
  // 終わった後である。「実行中だから受理しない」（busy）という応答は持たない
  // （openspec/specs/api/project/delete。change fix-rename-during-running-session）。

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
    throw deleteErrorToHttp(error)
  }

  return new Response(null, { status: 204 })
})
