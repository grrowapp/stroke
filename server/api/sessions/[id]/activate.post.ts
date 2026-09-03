import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { broadcastProjectCreation } from '../../../utils/control/board'
import { readStrokeConfig } from '../../../utils/stroke/config'
import { conflict } from '../../../utils/stroke/conflict'
import { projectDir } from '../../../utils/stroke/paths'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { readState, withStateLock, writeState, type SessionState } from '../../../utils/stroke/session-store'

/**
 * U15: 昇格したプロジェクトの完成を記録する（openspec/specs/api/session/activate）。
 *
 * 承認の判断（U10）・昇格（U14）・起動（U13）と同じく、承認の流れの1段を1つの endpoint が
 * 受け持つ。**起動も判断も昇格も受け持たない。** `invocation` にも触れない——実行の記録は
 * invokeAi がこの応答を見てから書く（openspec/specs/agent/invocation）。
 *
 * ## 完成の根拠は承認依頼のファイルの存在だけ
 *
 * `.spec-workflow/approvals/<category>/*.json` が1件以上在ることをもって完成とする。中身は
 * 読まず、状態（保留・承認済み・却下済み）も問わない。本家の REST は呼ばない——本家が
 * 動いていなくても判定できなければならない（ADR-0005）。
 *
 * 実物の配置（本家 2.2.7 で確認 2026-09-02）: category ディレクトリの直下に
 * `approval_<ts>_<id>.json` が並び、同じ階層に `.snapshots/` ディレクトリが在る。
 * `approvals/` 直下にファイルは置かれない。**数えるのは category の中の `.json` だけ**とし、
 * 隠しファイル・ディレクトリ・`approvals/` 直下のファイルは数えない
 * （openspec/changes/add-activated-phase design D3・Open Question）。
 *
 * ## busy ガードを持たない
 *
 * ここを叩くのは invokeAi が `invocation` を `idle` に変える**前**である。その時点で対象の
 * 実行はまだ占有中なので、busy を見ると自分の実行に弾かれる（design D3）。
 *
 * ## 読んで書くはセッション単位で直列化する
 *
 * `invocation` には触れないが、`state.json` は1ファイルなので書き込みは丸ごとである。起動時の
 * 後始末（A8）と同じ対象に同時に触れると、古い写しで互いを上書きしうる。`withStateLock` で
 * 「読む → 判定 → 書く」を1区間にする（A8 の `writeInvocation` も同じ待ち行列を通る）。
 *
 * ## 409 はすべて `phase` で返す
 *
 * 呼び手は invokeAi と起動時の書き上げだけで、どちらも 409 を「今は完成でない」と読む。
 * 壊れた `state.json` は書き換えない（「分からないものを通さない」）。
 */
export default defineEventHandler(async (event): Promise<Response> => {
  const name = await requireSessionId(event)
  const root = readStrokeConfig().projectShareRoot

  await withStateLock(name, async () => {
    let state: SessionState
    try {
      state = await readState(name)
    } catch {
      throw conflict('phase', 'state.json を読めない。完成を記録しない。')
    }

    if (state.phase === 'activated') {
      throw conflict('phase', 'このプロジェクトは既に完成している。')
    }
    if (state.phase !== 'approved') {
      throw conflict('phase', 'まだ昇格していない。完成を記録できるのはプロジェクトだけ。')
    }

    if (!(await hasApprovalRequest(projectDir(root, name)))) {
      throw conflict('phase', 'まだ完成していない。承認依頼が1件も無い。')
    }

    // 一方向の遷移。phase 以外は触らない（`runId` は完成後の起こし直しの続き先になる）
    await writeState(name, { ...state, phase: 'activated' })
  })

  // 成功の決着はここだけが流す（openspec/specs/api/session/activate「完成の記録は決着として
  // 上層へ届く」）。配信は接続中のブラウザへ送るだけで、失敗しても記録の成否に関わらない。
  broadcastProjectCreation(name, 'done')

  return new Response(null, { status: 204 })
})

const APPROVALS_DIR = join('.spec-workflow', 'approvals')

/**
 * 承認依頼のファイルが1件以上在るか。category を問わない——完成の意味は「レビューできる
 * 状態に達した」であって「steering の承認依頼が在る」ではなく、category の名前は本家の
 * 都合で変わりうる（design D3）。
 */
async function hasApprovalRequest(projectPath: string): Promise<boolean> {
  const approvals = join(projectPath, APPROVALS_DIR)

  let categories
  try {
    categories = await readdir(approvals, { withFileTypes: true })
  } catch {
    return false
  }

  for (const category of categories) {
    if (!category.isDirectory() || category.name.startsWith('.')) continue
    if (await hasApprovalFile(join(approvals, category.name))) return true
  }
  return false
}

async function hasApprovalFile(categoryPath: string): Promise<boolean> {
  let entries
  try {
    entries = await readdir(categoryPath, { withFileTypes: true })
  } catch {
    return false
  }
  return entries.some(
    entry => entry.isFile() && !entry.name.startsWith('.') && entry.name.endsWith('.json'),
  )
}
