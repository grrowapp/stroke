import { readStrokeConfig } from '../../../utils/stroke/config'
import { conflict } from '../../../utils/stroke/conflict'
import { LOG_PREFIX } from '../../../utils/stroke/log'
import { assertNameAvailable, promoteSessionToProject } from '../../../utils/stroke/project'
import { approveBody, parseBody } from '../../../utils/stroke/request-schemas'
import { invokePath } from '../../../utils/stroke/invoke'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { readState, sessionProposal, writeState } from '../../../utils/stroke/session-store'
import { forgetSubmissions } from '../../../utils/stroke/submission-signal'

/**
 * U10: 承認してプロジェクトへ昇格させる。承認は昇格の唯一の引き金。
 *
 * 昇格はセッションディレクトリの改名だけである（openspec/specs/project/generation）。
 * proposal はセッションの時点から `docs/proposal.md` に在り（受理の時点で A7 が残す）、
 * 改名はそれを動かさない。**承認は proposal を書かず、既にあるものに触れない。**
 *
 * **`approved` かつ未改名の宙吊りを作らない。** 順序は「衝突確認 → phase 書き換え →
 * 改名」で、改名が失敗したら phase を `proposed` へ書き戻す（design.md D3）。
 * phase を後から書けないのは、改名でセッションディレクトリごと移動し `state.json` の
 * 場所が変わるためである。どの時点で失敗しても、セッションは元の名前・`proposed` の
 * まま残り、再度承認できる。
 *
 * busy ガードは U7・U9 のみ（design.md ガードの語彙）。承認はエージェントの呼び出しを
 * 起動しないため対象にしない。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)
  const { projectName } = parseBody(approveBody, await readBody(event))

  const state = await readState(sessionId)
  if (state.phase === 'approved') {
    throw conflict('phase', 'このセッションは既に承認済み。')
  }
  if (state.phase !== 'proposed') {
    throw conflict('phase', '承認できるのは proposal が出ているときだけ。')
  }

  // proposal が残っていなければ昇格しない。A7 は残せたときだけ受理を成立させるので、
  // `proposed` に進んだセッションでは通常ここを通る。通らないのは外から消された場合で、
  // そのときはセッションを `proposed` のまま残す。
  if ((await sessionProposal(sessionId).read()) === undefined) {
    throw conflict('phase', '承認する proposal が見つからない。')
  }

  const shareRoot = readStrokeConfig().projectShareRoot

  // 昇格後も steering の実行が起こるので、`invocation` を持たせて引き継ぐ
  // （openspec/specs/agent/invocation）。回数は新しい用途なので 0 から数え直す。
  // 衝突確認は phase を書く**前**に通す（design.md D3）。既にあれば何も動かさずに 409 で、
  // セッションは `proposed` のまま残る。
  await assertNameAvailable(shareRoot, projectName)

  await writeState(sessionId, { phase: 'approved', projectName, invocation: 'idle', retries: 0 })
  let target: string
  try {
    target = await promoteSessionToProject(shareRoot, sessionId, projectName)
  } catch (error) {
    // 昇格しなかったので承認を確定させない。元の状態へ戻して同じ失敗を返す。
    await writeState(sessionId, state)
    throw error
  }

  // 昇格が成功したときだけ steering を起こす（ADR 0011）。cwd は生成先の path で、
  // 完了は待たない——画面はすぐ一覧へ戻れる（design.md D9）。
  // 対象の id は昇格後のディレクトリ名（= プロジェクト名）になる。
  //
  // **U13 を叩く**（tasks 9.1）。invokeAi を直接呼ぶと busy ガード（beginRun / endRun）と
  // 前提チェック（503）を素通りし、steering の実行中に削除や二重起動が通ってしまう。
  //
  // path は相対。自分自身を叩くのに外向けの設定値（`claude.apiBaseUrl`）で URL を組むと、
  // 待ち受けを変えた瞬間に届かなくなる（実測: E2E の 3199 で fetch failed）。
  // 昇格した時点で旧 id の提出の記録は用済み。以後この id は二度と来ない。
  forgetSubmissions(sessionId)

  $fetch(invokePath(projectName, target)).catch(async (error) => {
    // **キックが届かなかったら `failed` に倒す。** 前提の欠け（503）やネットワーク層の
    // 失敗でここに来ると、`invocation` は昇格時に書いた `idle` のまま残る。巡回は
    // `failed` しか拾わないので、倒しておかないと誰も起こし直さない。
    console.error(`${LOG_PREFIX} steering の起動に失敗: ${projectName}`, error)
    try {
      const promoted = await readState(projectName)
      await writeState(projectName, { ...promoted, invocation: 'failed' })
    } catch (writeError) {
      console.error(`${LOG_PREFIX} 起動失敗の記録に失敗: ${projectName}`, writeError)
    }
  })

  setResponseStatus(event, 200)
  return null
})
