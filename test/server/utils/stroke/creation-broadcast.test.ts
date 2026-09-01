import { describe, expect, it } from 'vitest'

import { creationOutcomeOf } from '../../../../server/utils/stroke/session-store'

/**
 * 決着の配信の起点（design.md D5）。
 *
 * 起点は `writeInvocation`（A8 の実体）に置く。`invocation` の書き込みが必ずここを通るので、
 * 「書いたのに配信しない経路」が生まれない。
 *
 * **`invocation` を合図の材料に使うが、行の判定には使わない。** 行が生成中か完了かは
 * ファイルシステム（`.spec-workflow/` の有無）から毎回導く（D7）。ここで流すのは
 * 「決着したから取り直せ」と、決着のモーダルを出す引き金だけである。
 *
 * 生成の**始まり**（`in-progress`）の起点は昇格の段（U14・`promote.post.ts`）にあり、
 * 承認の判断（U10）では流さない。そちらは `test/server/api/strokes/promote.post.test.ts` が
 * 押さえる。昇格の直後に A8 で書かれる `failed`（起動の段の引き渡し）は決着ではないので、
 * ここの「リトライ待ちは流さない」がそのまま効く。
 */

describe('決着の配信の起点', () => {
  it('昇格したプロジェクトの完了は流す', () => {
    expect(creationOutcomeOf('approved', 'idle')).toBe('done')
  })

  it('終端の失敗は流す', () => {
    expect(creationOutcomeOf('approved', 'error')).toBe('failed')
  })

  it('リトライ待ちは流さない。巡回が起こし直す途中で、決着ではない', () => {
    expect(creationOutcomeOf('approved', 'failed')).toBeNull()
  })

  it('実行中は流さない。始まっただけで、決着ではない', () => {
    expect(creationOutcomeOf('approved', 'running')).toBeNull()
  })

  it('ストロークのセッションは流さない。一覧に出ないので上層に関係がない', () => {
    for (const phase of ['stroking', 'proposed'] as const) {
      for (const invocation of ['idle', 'running', 'failed', 'error'] as const) {
        expect(creationOutcomeOf(phase, invocation), `${phase} / ${invocation}`).toBeNull()
      }
    }
  })
})
