import { describe, expect, it } from 'vitest'

import { creationOutcomeOf } from '../../../../server/utils/stroke/session-store'

/**
 * 決着の配信の起点のうち、A8（`writeInvocation`）が担う**失敗**の側。
 *
 * 起点は `writeInvocation`（A8 の実体）に置く。`invocation` の書き込みが必ずここを通るので、
 * 「書いたのに配信しない経路」が生まれない。
 *
 * **成功の決着はここから出ない**（add-activated-phase design D7）。`idle` は「終わった」で
 * あって「できた」ではなく、`done` を流すのは完成の記録（U15）だけである。そちらは
 * `test/server/api/sessions/activate/index.post.test.ts` が押さえる。
 *
 * 生成の**始まり**（`in-progress`）の起点は昇格の段（U14・`promote/index.post.ts`）にあり、
 * 承認の判断（U10）では流さない。そちらは `test/server/api/strokes/promote/index.post.test.ts` が
 * 押さえる。昇格の直後に A8 で書かれる `failed`（起動の段の引き渡し）は決着ではないので、
 * ここの「リトライ待ちは流さない」がそのまま効く。
 */

describe('決着の配信の起点（失敗の側）', () => {
  it('生成中の実行が終端に達したら失敗を流す', () => {
    expect(creationOutcomeOf('approved', 'error')).toBe('failed')
  })

  it('idle を書いても成功の決着は流さない。完了は完成の記録（U15）が流す', () => {
    expect(creationOutcomeOf('approved', 'idle')).toBeNull()
  })

  it('リトライ待ちは流さない。巡回が起こし直す途中で、決着ではない', () => {
    expect(creationOutcomeOf('approved', 'failed')).toBeNull()
  })

  it('実行中は流さない。始まっただけで、決着ではない', () => {
    expect(creationOutcomeOf('approved', 'running')).toBeNull()
  })

  it('完成済み（activated）の起こし直しは、終端に達しても生成の決着として流さない', () => {
    for (const invocation of ['idle', 'running', 'failed', 'error'] as const) {
      expect(creationOutcomeOf('activated', invocation), invocation).toBeNull()
    }
  })

  it('ストロークのセッションは流さない。一覧に出ないので上層に関係がない', () => {
    for (const phase of ['stroking', 'proposed'] as const) {
      for (const invocation of ['idle', 'running', 'failed', 'error'] as const) {
        expect(creationOutcomeOf(phase, invocation), `${phase} / ${invocation}`).toBeNull()
      }
    }
  })
})
