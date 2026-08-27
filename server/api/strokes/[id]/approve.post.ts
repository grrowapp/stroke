import { broadcastProjectCreation } from '../../../utils/control/board'
import { readStrokeConfig } from '../../../utils/stroke/config'
import { conflict } from '../../../utils/stroke/conflict'
import { LOG_PREFIX } from '../../../utils/stroke/log'
import { assertNameAvailable, promoteSessionToProject, revertPromotion } from '../../../utils/stroke/project'
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
 * **`approved` かつ未改名の宙吊りを作らない。** 順序は「衝突確認 → 改名 → `phase` を
 * 書く」で、書き込みが失敗したら改名を戻す。どの時点で失敗しても、セッションは元の名前・
 * `proposed` のまま残り、再度承認できる。
 *
 * 逆順（`phase` を書いてから改名）にすると、書いた直後に落ちたときに **uuid のままで
 * `approved`** のディレクトリが残り、それが一覧に「生成中」として出てしまう。
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

  // 衝突確認は改名の**前**に通す。既にあれば何も動かさずに 409 で、セッションは
  // `proposed` のまま残る。
  await assertNameAvailable(shareRoot, projectName)

  // **改名してから phase を書く。**
  //
  // 逆にすると、`phase: 'approved'` を書いた直後にプロセスが落ちたとき、uuid のままで
  // `approved` のディレクトリが残る。それは一覧に「生成中」として出てしまい、名前が uuid の
  // プロジェクトが並ぶ。改名を先に済ませれば、その残骸は原理的に生まれない。
  //
  // 巻き戻しも対称になる。書き込みに失敗したら**改名を戻す**だけでよく、移動を1回戻せば
  // 元の状態に返る。以前は「消えたかもしれない古い場所へ phase を書き戻す」形だった。
  const target = await promoteSessionToProject(shareRoot, sessionId, projectName)

  // 昇格後も steering の実行が起こるので、`invocation` を持たせて引き継ぐ
  // （openspec/specs/agent/invocation）。回数は新しい用途なので 0 から数え直す。
  // 書き込み先は**改名後の場所**である。
  try {
    await writeState(projectName, {
      phase: 'approved',
      projectName,
      invocation: 'idle',
      retries: 0,
    })
  } catch (error) {
    // 承認を確定させない。改名を戻して、セッションを元の名前・`proposed` のまま残す。
    await revertPromotion(shareRoot, projectName, sessionId)
    throw error
  }

  // **昇格した瞬間に上層へ知らせる。** 承認した本人はこの直後に一覧へ戻る。開いたままの
  // 一覧にも生成中の行が出るようにする（specs/project/generation「生成の進行は、開いている
  // 一覧へ届く」）。配信は接続中のブラウザへ送るだけで、失敗しても承認の成否に関わらない
  // ——`broadcast` は死んだ接続をその場で落とすだけで投げない。
  broadcastProjectCreation(projectName, 'in-progress')

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

  return new Response(null, { status: 204 })
})
