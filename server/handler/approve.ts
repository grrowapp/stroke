import { assertNameAvailable } from '../utils/stroke/project'
import {
  readState,
  sessionProposal,
  withDecision,
  withStateLock,
  withoutDecision,
  writeState,
  type ProposedState,
} from '../utils/stroke/session-store'

/**
 * U10 の実処理——承認の判断を記録する／取り下げる。
 *
 * **判断の書き換えはここ1箇所である。** 取り下げは U10 の `DELETE` からも、U14 が名前の
 * 衝突で昇格できなかったときからも起きる（`handler/promote.ts`）。2箇所に書くと、
 * 「取り消すのは判断だけで `phase` は動かさない」という決めが片方だけ崩れうる。
 *
 * **局面の述語は持たない。** 判断を下せる局面か（`proposed` か・昇格済みでないか）は
 * endpoint が `readState` の結果に対して見る（`server/api/sessions/[id]/approve/**`）。
 */

/** 記録が成立しなかった理由。endpoint がこれを 409 の文言へ写す。 */
export type DecisionRefusal =
  /** 判断の対象となる proposal が保存先に残っていない */
  | 'no-proposal'
  /** 既に判断が記録されている。取り下げてから下し直す */
  | 'already-decided'

export type RecordDecisionResult = { ok: true } | { ok: false, reason: DecisionRefusal }

/**
 * 判断を記録する。順序は「proposal の実在 → 二重の判断 → 名前の衝突 → 書き込み」。
 *
 * 判断の対象となる proposal が残っていなければ記録しない。A7 は残せたときだけ受理を
 * 成立させるので、`proposed` に進んだセッションでは通常ここを通る。通らないのは外から
 * 消された場合で、そのときはセッションを `proposed` のまま残す。
 *
 * 衝突は昇格の直前にも確認されるが（U14）、判断の時点で分かるものはその場で伝える。
 * 何も動かさずに `assertNameAvailable` の 409 が外へ出て、セッションは `proposed` のまま
 * 残る。**この 409 は `utils/stroke/project.ts` が作る**——写し替えずにそのまま通す。
 *
 * `withDecision` は `proposed` を受けて `proposed` を返すので、ここで `phase` が動くことは
 * ない。書けなければ失敗が返り、判断は記録されない。
 */
export async function recordDecision(
  root: string,
  sessionId: string,
  state: ProposedState,
  projectName: string,
): Promise<RecordDecisionResult> {
  if ((await sessionProposal(sessionId).read()) === undefined) {
    return { ok: false, reason: 'no-proposal' }
  }

  // 重ねて判断を下すことは受理しない。取り下げてから下し直す（`DELETE`）
  if (state.decision !== undefined) {
    return { ok: false, reason: 'already-decided' }
  }

  await assertNameAvailable(root, projectName)

  await writeState(sessionId, withDecision(state, { projectName }))
  return { ok: true }
}

/**
 * 判断を取り下げる。取り消すのは判断だけで、`phase` は `proposed` のまま動かない。
 *
 * proposal・ストロークの往復の記録・ディレクトリの中身には触れない。判断を持たない状態を
 * 渡す呼び方はしない——「判断が無ければ何も変えない」の判定は endpoint が持つ。
 */
export async function withdrawDecision(sessionId: string, state: ProposedState): Promise<void> {
  await writeState(sessionId, withoutDecision(state))
}

/**
 * 名前の衝突で昇格できなかったセッションの判断を取り下げる（U14 から呼ぶ）。
 *
 * **消すのは `conflictedName` を持つ判断だけである。** 昇格が冒頭で読んだ状態は占有を取る
 * 前のもので、そこから衝突の検出までの間に判断は入れ替わりうる——承認（U10）は busy
 * ガードの対象外であり（`approve/index.post.ts`「busy ガードは U7・U9 のみ」）、昇格の占有も
 * U10 を止めない。別の名前の判断（画面が既に下し直したもの）はこの 409 の理由になって
 * いない——その名前は `assertNameAvailable` で確かめていないので、消す根拠が無い。判断が
 * 既に消えていた場合も何もしない。
 *
 * **`withStateLock` が排他するのは lock を取る書き手だけである**（`writeInvocation`・
 * `handler/activate.ts`・`invoke.ts`）。U10 は lock を取らないので直列化されない——上の名前の
 * 照合が要るのはそのためで、lock はそれに加えて `state.json` の read-modify-write をこの
 * repo の既定の形に揃える。**読み直しと書き込みの間に U10 が挟まる窓は原理上残る**（閉じる
 * には U10 側にも lock が要る。fix-promote-name-conflict-withdrawal の範囲外）。
 */
export async function withdrawConflictedDecision(
  sessionId: string,
  conflictedName: string,
): Promise<void> {
  await withStateLock(sessionId, async () => {
    const current = await readState(sessionId)
    // 見るのは判断そのものであって局面ではない。判断を持たない形（昇格後・ストローク中も
    // 含む）は取り下げる対象が無く、名前が違う判断はこの 409 の理由になっていない
    if (!('decision' in current) || current.decision?.projectName !== conflictedName) return
    await withdrawDecision(sessionId, current)
  })
}
