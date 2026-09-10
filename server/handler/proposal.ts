import type { Phase, ProposalMessage } from '#shared/stroke'
import { isKebabCase } from '../utils/stroke/project'
import { notifySubmission } from '../utils/stroke/submission-signal'
import {
  markProposalStrokeIfFirst,
  readState,
  sessionProposal,
  writeState,
  type ActiveSessionState,
} from '../utils/stroke/session-store'
import { proposalChannel } from '../utils/stroke/ws-channels'

/**
 * proposal の実処理——A7 が受理して残す側と、W2 が接続の瞬間に流す側。
 *
 * **書く側と読む側を1つのファイルに置く。** A7 が `docs/proposal.md` と `state.projectName` へ
 * 残したものを、W2 が繋ぎ直した画面へそのまま流す。流すメッセージの組み立て（`message`）が
 * 1つで済むのもこのためで、受理の瞬間と接続の瞬間で違う形が作られることが起きない。
 *
 * **受理してよい局面・流してよい局面はここでは決めない。** どちらも端（endpoint と route）が
 * 自分の literal で持つ（`server/api/strokes/[id]/proposal/index.post.ts`・
 * `server/routes/api/sessions/[id]/ws/proposal.ts`）。
 */

/** W2 が運ぶ形。受理の瞬間も接続の瞬間もここを通る。 */
function message(proposal: string, projectName: string | undefined): ProposalMessage {
  return { proposal, projectName: projectName ?? null }
}

/**
 * proposal を受理する。順序は **残す → phase を進める → 配信する**。
 *
 * **受理した本文はここで残す。** 配信（`publish`）はメモリ上の接続にしか届かないので、残さないと
 * 「提出の瞬間に繋いでいた画面にしか出ない」ことになる。繋ぎ直した画面にも承認にも同じ proposal が
 * 要る（openspec/specs/api/stroke/proposal）。残せなければそこで失敗し、phase も配信も行わない
 * ——逆順にすると、配信だけ届いて残っていない状態が作れてしまう。**この順序を api と分けて
 * 持たない**ので、端をまたいで崩れることが起きない。
 *
 * **出し直しで承認の判断は失効する。** 判断はそれが下された proposal に結びつく
 * （openspec/specs/api/session/approve）。proposal を書く口はここ1つなので、ここで判断を
 * 持ち越さなければ足りる——版の印は持たない（design.md 決定2）。前の状態を丸ごと写さないのは
 * そのためで、`proposed` からの出し直しに乗っている `decision` はここで落ちる。
 *
 * 候補名は kebab-case のときだけ採る（`docs/specs/api/contract.md` A7）。**これは入力の検証では
 * ない**——kebab-case でなくても 400 にはならず、既に在る候補が残るだけである。受理の可否を
 * 変えないので、書き込む値の決定としてここが持つ。
 *
 * `invocation` には触れない。実行の記録を書くのは invokeAi だけである
 * （openspec/specs/agent/invocation の MUST）。
 */
export async function submitProposal(
  sessionId: string,
  state: ActiveSessionState,
  proposal: string,
  projectName: string | undefined,
): Promise<void> {
  // 受理を成立させる前に残す。ここが失敗したら phase も配信も行わない
  await sessionProposal(sessionId).write(proposal)

  await markProposalStrokeIfFirst(sessionId)

  const candidate = projectName && isKebabCase(projectName) ? projectName : state.projectName

  await writeState(sessionId, {
    phase: 'proposed',
    currentQuestion: null,
    invocation: state.invocation,
    ...(state.retries === undefined ? {} : { retries: state.retries }),
    ...(candidate ? { projectName: candidate } : {}),
  })

  proposalChannel.publish(sessionId, message(proposal, candidate))
  // 完了の合図ではなく「作業が行われた」ことの記録。invokeAi が起動の前後で比べる。
  notifySubmission(sessionId)
}

/**
 * 接続の瞬間に流す現在の proposal。流すものが無ければ `null`。
 *
 * `from` に当てはまる局面で、かつ本文が残っているときだけ返す。集合を決めるのは route であり、
 * ここは当てはめるだけである。
 *
 * `state.json` が読めなければそのまま投げる（`currentQuestion` と同じ）。
 */
export async function currentProposal(
  sessionId: string,
  from: readonly Phase[],
): Promise<ProposalMessage | null> {
  const state = await readState(sessionId)
  if (!from.includes(state.phase)) return null

  const proposal = await sessionProposal(sessionId).read()
  if (proposal === undefined) return null

  return message(proposal, state.projectName)
}
