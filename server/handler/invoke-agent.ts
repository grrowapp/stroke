import type { Phase } from '#shared/stroke'
import { kick } from '../utils/stroke/invoke'
import { LOG_PREFIX } from '../utils/stroke/log'
import { beginRun, endRun } from '../utils/stroke/running'

/**
 * U13 の実処理——AI の呼び出しを起こし、占有と後始末を実行全体に紐づける。
 *
 * **`server/utils/stroke/invoke.ts` とは別物である。** あちらは呼び出しそのものの実体
 * （`kick` / invokeAi）で、ここは endpoint が要求した1回の起動を組み立てて占有と後始末を
 * 付ける層である。名前は endpoint（invoke-agent）に合わせてある。
 *
 * **待つのは組み立ての成否までである。** `running` 化・起動・完了検知・タイムアウト・
 * 上限判定は非同期の invokeAi が担い、AI の応答の完了は待たない
 * （openspec/specs/agent/invocation・design.md D2）。
 */

/** 起動を受け付けられなかった理由。endpoint はどちらも 503 に写す */
export type InvokeErrorKind =
  /** 組み立ての材料が揃わない（`kick` の `built` が失敗した） */
  | 'build'

export class InvokeError extends Error {
  constructor(
    public readonly kind: InvokeErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'InvokeError'
  }
}

export interface InvokeAgentInput {
  sessionId: string
  /** 実行の作業場所。占有のキーもここから引く */
  cwd: string
  phase: Phase
  retries: number
  /** 会話の続き先。持つのは昇格後の対象だけ */
  runId?: string
}

/**
 * 起動を1回起こす。
 *
 * 多重起動はここで止める（specs/api/invoke-agent）。**cwd からキーを引く。** キーは cwd の
 * 実体（`stat` の `dev`/`ino`）なので、承認による改名の前後で同じ物理ディレクトリを指す
 * 呼び出しは同じキーになり、id 違いでの二重起動が通らない
 * （fix-rename-during-running-session）。
 *
 * **起動の要求は冪等である。** 既に走っていればその要求は満たされているので、何も起こさずに
 * 戻る。「実行中だから受け付けない」（409 busy）は返さない——画面が次の起動を要求できる局面は
 * いずれも前の実行の決着の後にしか立たないので、ここへ届く重なりは同じ意図の要求（画面と
 * 巡回が同じ対象を起動する等）だけである。
 *
 * 枠の解放・接続表 token の削除は実行全体の完了（`settled`）に紐づける。
 * 組み立てに失敗した実行も、その失敗を記録し終えるまでは「実行中」として扱う
 * （design.md D4）。`settled` は組み立て失敗時も reject しないので、この `.catch`
 * は他の予期しない失敗に対する保険である。
 *
 * 組み立てに失敗したときだけは待って `InvokeError` を投げる——受理せずに終わったことを
 * 呼び出し側（画面・巡回・承認処理）が応答から知れるようにするためである
 * （fix-idle-stuck-on-run-build-failure・openspec/specs/api/session/invoke-agent）。
 */
export async function invokeAgent(input: InvokeAgentInput): Promise<void> {
  const start = await beginRun(input.cwd)
  if (!start.started) return
  const runKey = start.key

  const { built, settled } = kick({
    sessionId: input.sessionId,
    cwd: input.cwd,
    phase: input.phase,
    retries: input.retries,
    runId: input.runId,
  })

  settled
    .catch((error) => {
      console.error(`${LOG_PREFIX} AI 呼び出しの管理に失敗: ${input.sessionId}`, error)
    })
    .finally(() => endRun(runKey))

  try {
    await built
  } catch (error) {
    throw new InvokeError(
      'build',
      `起動の材料を組み立てられない: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
