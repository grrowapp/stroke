import { broadcastProjectCreation } from '../utils/control/board'
import { LOG_PREFIX } from '../utils/stroke/log'
import { assertNameAvailable, promoteSessionToProject, revertPromotion } from '../utils/stroke/project'
import { beginRun, endRun, sessionRunPath } from '../utils/stroke/running'
import { writeState } from '../utils/stroke/session-store'
import { submissionPath } from '../utils/stroke/submission-path'
import { withdrawConflictedDecision } from './approve'
import { internalFetch, saveAccessStore } from '../utils/access/request'
import { readStartedBy } from '../utils/access/started-by'
import { grantProject } from '../utils/access/store'

/**
 * U14 の実処理——判断のあるセッションをプロジェクトへ昇格させる。
 *
 * 昇格はセッションディレクトリの改名だけである（openspec/specs/project/generation）。
 * 順序は「衝突確認 → 改名 → `phase` を書く」で、書き込みが失敗したら改名を戻す。
 * どの時点で失敗しても、セッションは元の名前・`proposed` で残る。逆順（`phase` を書いてから
 * 改名）にすると、書いた直後に落ちたときに **uuid のままで `approved`** のディレクトリが
 * 残り、一覧に「生成中」として出てしまう。
 *
 * **局面の述語は持たない。** 昇格してよい局面か・判断が記録されているかは endpoint が
 * `readState` の結果に対して見る（`server/api/sessions/[id]/promote/index.post.ts`）。
 * 名前も引数で受ける——判断が持つ名前を endpoint が取り出して渡す。
 */

/**
 * その失敗が「名前の衝突」か。`conflict()` が 409 に載せる理由の印（`data.reason`）で見る
 * （`server/utils/stroke/conflict.ts`）。画面側（`useProposalReview.ts`）と同じく status と
 * 印の両方を見る。**入れ子の深さは画面側と違う**——あちらは `$fetch` が応答を包むので
 * `error.data.data.reason` を辿るが、ここは `createError` が作ったものを直に受けるので
 * `error.data.reason` である。
 *
 * status だけで見ない——衝突の確認と改名を包む `catch` には3種の失敗が入る。衝突の 409、
 * 名前の形が不正な 400（`assertProjectName`）、改名が転んだ 500（`promoteSessionToProject`）
 * である。判断を取り下げてよいのは衝突のときだけで、他の2つは同じ判断のままやり直せる。
 */
function isNameConflict(error: unknown): boolean {
  const e = error as { statusCode?: unknown, data?: unknown } | null
  if (e?.statusCode !== 409) return false
  const data = e.data
  if (typeof data !== 'object' || data === null) return false
  return (data as { reason?: unknown }).reason === 'name-conflict'
}

/**
 * 昇格させる。
 *
 * ## 失敗の種類で、判断の扱いが分かれる
 *
 * **改名・`phase` の書き込みが失敗したときは判断を残す。** 保存先の I/O が転んだだけで、
 * 同じ判断のまま昇格だけをやり直せる（openspec/specs/api/session/promote「後始末は段ごとに
 * 閉じる」の「昇格が改名または phase の書き込みで失敗したとき」）。
 *
 * **名前が衝突したときは、判断を取り下げてから 409 name-conflict を返す。** 判断が持つ名前は
 * 既に保存先で使われており、その判断のままでは何度やり直しても昇格できない——やり直しの
 * 対象は昇格ではなく判断そのものである（openspec/specs/project/generation「昇格の直前に
 * 既存名との衝突を確認する」）。**取り下げるのはここであって、衝突を伝えられた側では
 * ない。** 伝えられた側は別の名前を確定して改めて承認するだけでよく、取り下げが済んで
 * いることを前提にできる。取り下げそのものは `handler/approve.ts` が持つ。
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
 * ## 改名は走っている呼び出しを置き去りにしない（fix-rename-during-running-session）
 *
 * **改名するのはこの段である。** 改名は inode を保つため、対象で claude が走っている最中に
 * 改名すると、その呼び出しは改名先で生き続ける一方、自分を名乗る id は改名前のままになる。
 * 以後その呼び出しの操作（問いの送信・文書の提出・実行の記録）はすべて対象を見つけられずに
 * 落ち、成果はどこにも残らない。
 *
 * **その状況は、昇格の要求が実行中に届かないことで防ぐ。** 承認（U10）と昇格（U14）は
 * phase `proposed` でしか行えず、phase `proposed` は proposal を提出した実行の決着でしか
 * 立たない（openspec/specs/agent/invocation・stroke/frontier）。だから「実行中だから受理
 * しない」（409 busy）という応答は持たない——それは承認できる局面が実行中に立つことを
 * 前提にした設計であり、その前提を無くすのが本旨である
 * （openspec/specs/api/session/promote）。
 *
 * 改名の間だけ実行の枠を取っておくのは、昇格の直後に始まる steering の実行と重ならない
 * ようにするためである。取れなければ前提が崩れている（欠陥）なので、握りつぶさずに失敗を
 * 返す（ADR-0022）。解放は `finally` で必ず行い、steering の起動（U13）を叩く前に置く。
 */
export async function promote(root: string, sessionId: string, projectName: string): Promise<void> {
  // 改名の間、実行の枠を取っておく。確認から改名の完了までを、起動が割り込めない1区間に
  // する（fix-rename-during-running-session）。**ここまでは何も変えていない。**
  //
  // 取れないのは、届かないはずの実行中に昇格が届いたということで、前提が崩れている。
  // 理由を握りつぶさずに失敗として返す（ADR-0022）——`busy` のような「待てば通る」理由は
  // 持たない。
  const start = await beginRun(sessionRunPath(root, sessionId))
  if (!start.started) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: '対象で実行が走っている。承認できる局面では起こらないはずの状態である。',
    })
  }
  const runKey = start.key

  // 始めた利用者は改名の前に読んでおく。昇格後の `state.json` へ引き継ぎ、許可を付ける相手にする
  // （`access/permission`「昇格したら始めた本人に許可を付ける」）。昇格は内部の呼び出しから
  // 来ることがあるので、呼び出し元ではなくこの記録を使う（design D8）
  const startedBy = (await readStartedBy(root, sessionId))?.startedBy ?? null

  try {
    // 衝突確認は改名の**前**に通す。既にあれば改名は起こらない。
    // **改名してから phase を書く。** 巻き戻しは対称で、書き込みに失敗したら改名を戻すだけ。
    //
    // 衝突を投げうる口は**2つある**——ここの `assertNameAvailable` と、
    // `promoteSessionToProject` が改名の直前に通す同じ確認（`rename` は相手が空ディレクトリ
    // だと黙って置き換えうるので EEXIST 任せにしない。`utils/stroke/project.ts`）。
    // **どちらから出た衝突も同じ扱いにする**ので、catch は両方を覆う。
    try {
      await assertNameAvailable(root, projectName)
      await promoteSessionToProject(root, sessionId, projectName)
    } catch (error) {
      // 扱いの分かれ目は上の doc、取り下げの条件と手順は `handler/approve.ts` の
      // `withdrawConflictedDecision`。**取り下げが転んだらその失敗が 409 の代わりに
      // 外へ出る**——握り潰すと、応答は「取り下げた」と言うのに `state.json` には判断が残る。
      if (isNameConflict(error)) await withdrawConflictedDecision(sessionId, projectName)
      throw error
    }

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
        startedBy,
      })
    } catch (error) {
      // 昇格を確定させない。改名を戻して、セッションを元の名前・`proposed`・判断つきのまま残す。
      await revertPromotion(root, projectName, sessionId)
      throw error
    }
  } finally {
    // 占有の解放は成否によらず1箇所（`finally`）に集約する。既存の巻き戻し
    // （`revertPromotion`）と二重にしない——巻き戻しは改名を戻すだけで、占有の解放は
    // 別の関心である。**解放は steering の起動（U13）を叩く前に置く。** 改名後の U13 は
    // 同じキー（作業場所の実体）を取りに来るため、解放前に叩くと自分の占有で 409 になる。
    endRun(runKey)
  }

  // 始めた本人に許可を付ける。上層へ知らせる前に済ませ、本人の一覧に生成中の行が出るようにする。
  // 付けられなくても昇格は巻き戻さない（管理者がユーザー管理画面で付けられる）
  if (startedBy !== null) {
    try {
      await saveAccessStore((store) => grantProject(store, startedBy, projectName))
    } catch (error) {
      console.error(`${LOG_PREFIX} 始めた利用者へ許可を付けられなかった（昇格は残す）: ${projectName}`, error)
    }
  }

  // **昇格した瞬間に上層へ知らせる。** 昇格を要求した本人はこの直後に一覧へ戻る。開いたままの
  // 一覧にも生成中の行が出るようにする（specs/project/generation「生成の進行は、開いている
  // 一覧へ届く」）。判断の記録（U10）では配信しない——その時点でプロジェクトはまだ無い。
  // 配信は接続中のブラウザへ送るだけで、失敗しても昇格の成否に関わらない。
  broadcastProjectCreation(projectName, 'in-progress')

  // 起動の段を巡回へ引き渡す（上の doc「昇格の完了時点で `invocation` を `failed` にする」）。
  // path は相対。自分自身を叩くのに外向けの設定値で URL を組むと、待ち受けを変えた瞬間に
  // 届かなくなる（`invoke.ts`）。
  try {
    await internalFetch(submissionPath(projectName), {
      method: 'POST',
      body: { invocation: 'failed' },
    })
  } catch (error) {
    console.error(`${LOG_PREFIX} 起動の段の引き渡しに失敗（昇格は残す）: ${projectName}`, error)
  }
}
