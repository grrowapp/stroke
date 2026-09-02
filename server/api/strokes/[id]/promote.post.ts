import { broadcastProjectCreation } from '../../../utils/control/board'
import { readStrokeConfig } from '../../../utils/stroke/config'
import { conflict } from '../../../utils/stroke/conflict'
import { LOG_PREFIX } from '../../../utils/stroke/log'
import { assertNameAvailable, promoteSessionToProject, revertPromotion } from '../../../utils/stroke/project'
import { beginRun, endRun, sessionRunPath } from '../../../utils/stroke/running'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { isPromotedState, readState, writeState } from '../../../utils/stroke/session-store'
import { forgetSubmissions } from '../../../utils/stroke/submission-signal'
import { submissionPath } from '../../../utils/stroke/submission-path'

/**
 * U14: 判断のあるセッションをプロジェクトへ昇格させる（openspec/specs/api/session/promote）。
 *
 * 承認（U10）・昇格（ここ）・steering の起動（U13）の真ん中の段。**判断を下すことも、
 * 起動を要求することも受け持たない。**
 *
 * **記録された判断が無ければ受理しない。** 承認はプロジェクト生成の唯一の引き金であり、
 * その関係はここで守られる。分岐ではなく責務の不成立である（ADR-0014 補足1）——
 * 「判断のあるセッションを昇格させる」が責務で、判断が無ければそれが成立しない。
 *
 * **本文を取らない。** 名前は判断が持つ。引数で受けると判断と違う名前で昇格できてしまう。
 *
 * 昇格はセッションディレクトリの改名だけである（openspec/specs/project/generation）。
 * 順序は「衝突確認 → 改名 → `phase` を書く」で、書き込みが失敗したら改名を戻す。
 * どの時点で失敗しても、セッションは元の名前・`proposed`・**判断はそのまま**で残り、
 * 同じ判断のまま昇格だけをやり直せる。逆順（`phase` を書いてから改名）にすると、書いた
 * 直後に落ちたときに **uuid のままで `approved`** のディレクトリが残り、一覧に「生成中」
 * として出てしまう。
 *
 * ## 昇格の完了時点で `invocation` を `failed` にする
 *
 * ここは起動を要求しない。起動の要求が一度も届かなかったとき（要求した側が応答を受け取る
 * 前に離脱した等）に、系が自力で起こし直せる形で残す必要がある。巡回
 * （`server/plugins/01.retry-failed.ts`）は `failed` **だけ**を拾い、そこへ条件を足すことは
 * 禁じられている（openspec/specs/portal/batch）ので、まだ起動が済んでいないことを巡回が
 * 既に拾う値で表す。
 *
 * **失敗していないのに `failed` と書く。** 系はこの値を既に「起こし直す対象」の意味で
 * 使っている——`01.retry-failed.ts` の初回の刈り取りは、前のプロセスの残骸として残った
 * `running` を「失敗したから」ではなく「誰も起こし直さないから」`failed` へ倒している。
 * 同じ用法で、書き方も同じ（A8 への POST）に揃える。
 *
 * **`writeState` で直に書かず、A8 を通す。** `invocation` の書き込みは A8 を通してのみ行う
 * （openspec/specs/agent/invocation）。書き込み口を1つに保つための規定で、書き込みに
 * 付随する上層への合図の判定（`writeInvocation`）もそこにしか無い。**応答を返す前に待ち切る**
 * ——昇格の応答を見た側が続けて叩く U13 に追い越されない。
 *
 * A8 が失敗しても昇格は巻き戻さない（後始末は段ごとに閉じる）。`idle` のまま残ると巡回が
 * 拾わないので、そのときは要求する側のキックだけが起動の道になる。
 *
 * ## busy ガードはここにある（fix-rename-during-running-session）
 *
 * **改名するのはこの段である。** 改名は inode を保つため、対象で claude が走っている最中に
 * 改名すると、その呼び出しは改名先で生き続ける一方、自分を名乗る id は改名前のままになる。
 * 以後その呼び出しの操作（問いの送信・文書の提出・実行の記録）はすべて対象を見つけられずに
 * 落ち、成果はどこにも残らない。承認（U10）は判断を記録するだけで改名しないので対象では
 * ない——対象になるのは改名するここだけである。
 *
 * 対象の作業場所を `beginRun` で占有してから「衝突確認 → 改名 → `phase` を書く」へ進み、
 * `finally` で必ず解放する。**占有できなければ 409 busy を返し、何も変えずに終わる。**
 *
 * **解放は steering の起動（U13）を叩く前に置く。** U13 は呼び手（画面・巡回）がこの
 * endpoint の成功応答を見た直後に叩き、同じキー（作業場所の実体）を取りに来る。解放を
 * 後（配信や A8 への引き渡しの後）に回すと、自分がまだ持っている占有で U13 が 409 に
 * なる。占有の区間は「衝突確認 → 改名 → `phase` 書き込み」だけに絞り、配信
 * （`broadcastProjectCreation`）・提出記録の破棄（`forgetSubmissions`）・A8 への引き渡しは
 * 解放の外側で行う。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)

  const state = await readState(sessionId)
  // `approved` も `activated` も昇格済み。重ねての昇格は受理しない
  if (isPromotedState(state)) {
    throw conflict('phase', 'このセッションは既に昇格している。')
  }
  if (state.phase !== 'proposed' || state.decision === undefined) {
    throw conflict('phase', '承認の判断が記録されていない。先に承認すること。')
  }
  const { projectName } = state.decision

  const shareRoot = readStrokeConfig().projectShareRoot

  // busy ガード。対象に実行中の呼び出しがあれば 409 busy で断り、**ここまでは何も
  // 変えていない**。占有はここから、改名・phase 書き込みが終わった直後（steering の
  // 起動を叩く前）まで——確認から改名の完了までを、起動が割り込めない1区間にする
  // （fix-rename-during-running-session）。
  const runKey = await beginRun(sessionRunPath(shareRoot, sessionId))

  try {
    // 衝突確認は改名の**前**に通す。既にあれば何も動かさずに 409 で、セッションは
    // `proposed`・判断つきのまま残る。
    await assertNameAvailable(shareRoot, projectName)

    // **改名してから phase を書く。** 巻き戻しは対称で、書き込みに失敗したら改名を戻すだけ。
    await promoteSessionToProject(shareRoot, sessionId, projectName)

    // 昇格後も steering の実行が起こるので、`invocation` を持たせて引き継ぐ
    // （openspec/specs/agent/invocation）。回数は新しい用途なので 0 から数え直す。
    // **状態を作る書き込みであって遷移ではない**ので `idle` を置く。遷移（→ `failed`）は
    // この後 A8 を通す。書き込み先は**改名後の場所**である。
    try {
      await writeState(projectName, {
        phase: 'approved',
        projectName,
        invocation: 'idle',
        retries: 0,
      })
    } catch (error) {
      // 昇格を確定させない。改名を戻して、セッションを元の名前・`proposed`・判断つきのまま残す。
      await revertPromotion(shareRoot, projectName, sessionId)
      throw error
    }
  } finally {
    // 占有の解放は成否によらず1箇所（`finally`）に集約する。既存の巻き戻し
    // （`revertPromotion`）と二重にしない——巻き戻しは改名を戻すだけで、占有の解放は
    // 別の関心である。**解放は steering の起動（U13）を叩く前に置く。** 改名後の U13 は
    // 同じキー（作業場所の実体）を取りに来るため、解放前に叩くと自分の占有で 409 になる。
    endRun(runKey)
  }

  // **昇格した瞬間に上層へ知らせる。** 昇格を要求した本人はこの直後に一覧へ戻る。開いたままの
  // 一覧にも生成中の行が出るようにする（specs/project/generation「生成の進行は、開いている
  // 一覧へ届く」）。判断の記録（U10）では配信しない——その時点でプロジェクトはまだ無い。
  // 配信は接続中のブラウザへ送るだけで、失敗しても昇格の成否に関わらない。
  broadcastProjectCreation(projectName, 'in-progress')

  // 昇格した時点で旧 id の提出の記録は用済み。以後この id は二度と来ない。
  forgetSubmissions(sessionId)

  // 起動の段を巡回へ引き渡す（上の doc「昇格の完了時点で `invocation` を `failed` にする」）。
  // path は相対。自分自身を叩くのに外向けの設定値で URL を組むと、待ち受けを変えた瞬間に
  // 届かなくなる（`invoke.ts`）。
  try {
    await $fetch(submissionPath(projectName), {
      method: 'POST',
      body: { invocation: 'failed' },
    })
  } catch (error) {
    console.error(`${LOG_PREFIX} 起動の段の引き渡しに失敗（昇格は残す）: ${projectName}`, error)
  }

  return new Response(null, { status: 204 })
})
