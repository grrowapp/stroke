import type { Phase } from '#shared/stroke'
import { broadcastProjectCreation } from '../utils/control/board'
import {
  isPromotedState,
  readState,
  withStateLock,
  writeState,
  type SessionState,
} from '../utils/stroke/session-store'

/**
 * U15 の実処理——昇格したプロジェクトの完成を記録する。
 *
 * ## 読んで書くはセッション単位で直列化する
 *
 * `invocation` には触れないが、`state.json` は1ファイルなので書き込みは丸ごとである。起動時の
 * 後始末（A8）と同じ対象に同時に触れると、古い写しで互いを上書きしうる。`withStateLock` で
 * 「読む → 判定 → 書く」を1区間にする（A8 の `writeInvocation` も同じ待ち行列を通る）。
 * **読みがこの区間の中に要るので、状態は endpoint ではなくここで読む。**
 *
 * ## 局面の述語は持たない
 *
 * どの局面から完成へ動かしてよいかは endpoint が literal で持ち、`from` として渡す
 * （`server/api/sessions/[id]/activate/index.post.ts`）。ここはそれを当てはめるだけで、
 * 当てはまらなければ観測した局面をそのまま返す——どの status とどの文言にするかは
 * endpoint が決める。呼び出し元を知らせる引数も持たない。**受理する局面をここが自分の
 * literal で決めることはない。**
 */

/** 記録できなかったときに、代わりに観測されたもの。`unreadable` は `state.json` が読めない */
export type ObservedPhase = Phase | 'unreadable'

export type ActivationResult = { ok: true } | { ok: false, observed: ObservedPhase }

/**
 * 完成を記録する。`from` に当てはまる局面のときだけ `activated` へ一方向に動かす。
 *
 * phase 以外は触らない（`runId` は完成後の起動し直しの続き先になる）。
 *
 * 成功の決着はここだけが流す（openspec/specs/api/session/activate「完成の記録は決着として
 * 上層へ届く」）。配信は接続中のブラウザへ送るだけで、失敗しても記録の成否に関わらない。
 * **配信は lock の外**——記録が済んでから流す。
 */
export async function recordActivation(
  sessionId: string,
  from: readonly Phase[],
): Promise<ActivationResult> {
  const result = await withStateLock(sessionId, async (): Promise<ActivationResult> => {
    let state: SessionState
    try {
      state = await readState(sessionId)
    } catch {
      return { ok: false, observed: 'unreadable' }
    }

    if (!from.includes(state.phase)) {
      return { ok: false, observed: state.phase }
    }

    // **これは局面の政策ではなく、書ける形かの確認である。** `state.json` の形は phase を
    // 判別子に持ち（`SessionState`）、昇格後の形だけが `projectName` を伴って完成を記録できる。
    // 受理する局面を決めているのは呼び出し元が渡した `from` で、ここはその集合が昇格後の
    // 局面だけを含む限り通らない——**形を型で保証するための、同じ判別子の確認**である。
    // 項目の有無では代えられない（`proposed` も候補名を持ちうる。A7 が書く）。
    if (!isPromotedState(state)) {
      return { ok: false, observed: state.phase }
    }

    await writeState(sessionId, { ...state, phase: 'activated' })
    return { ok: true }
  })

  if (result.ok) broadcastProjectCreation(sessionId, 'done')

  return result
}
