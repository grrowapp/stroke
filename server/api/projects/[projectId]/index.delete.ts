import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { DeleteError, isSafeSegment, removeTarget } from '../../../handler/delete'
import { isAfterApproval, readPhase } from '../../../handler/phase'
import { readStrokeConfig } from '../../../utils/stroke/config'
import { conflict } from '../../../utils/stroke/conflict'
import { isRunning } from '../../../utils/stroke/running'
import { deriveProjectId } from '../../../utils/upstream/project-id'

/**
 * プロジェクトを消す（`openspec/specs/api/project/delete`）。
 *
 * **メソッドで振り分ける。** パスに `delete` という動詞を置かず、
 * `DELETE /api/projects/:projectId` とする。メソッドを絞らない handler にすると、削除が
 * `GET` でも到達できてしまう。
 *
 * **消せるのは承認以降のものだけである。** まだプロジェクトになっていないセッションは
 * ここでは受理しない——セッションの削除が扱う。この判定は endpoint が持ち、消す動作
 * （`handler/delete`）は判定を持たない。
 *
 * **`.spec-workflow/` を持つものは消さない。** それは本家がプロジェクトルートとして
 * 受け取っている実体で、この口が扱う対象ではない。この口は「作りきれずに終わったもの」を
 * 片付けるためにある。
 *
 * 対象は `projectId` で指す。生成中・失敗した行は本家に登録されておらず registry から
 * 引けないので、**保存先を走査して導出値と突き合わせる**。id から名前を復元する手段は
 * ハッシュの性質上これしかない。
 */
export default defineEventHandler(async (event): Promise<null> => {
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

  if (isRunning(name)) {
    throw conflict('busy', 'このプロジェクトは AI の応答を待っている。完了するまで削除は受け付けない。')
  }

  const phase = await readPhase(root, name)
  if (phase === null || !isAfterApproval(phase)) {
    throw conflict('phase', 'まだプロジェクトになっていない。セッションの削除を使うこと。')
  }

  if (await hasSpecWorkflow(root, name)) {
    throw conflict('phase', '中身のあるプロジェクトはここでは消せない。')
  }

  try {
    await removeTarget(root, name)
  } catch (error) {
    throw toHttp(error)
  }

  return null
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

async function hasSpecWorkflow(root: string, name: string): Promise<boolean> {
  try {
    await readdir(join(root, name, '.spec-workflow'))
    return true
  } catch {
    return false
  }
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
