import { describe, expect, it } from 'vitest'

import { questionViolations } from '../../../../server/utils/stroke/question'

/**
 * 読み取れなかった理由（`questionViolations`）。
 *
 * 見るのは「どの項目がどう反したか」と「今いくつなのか」が返ること。理由が無いと、
 * 送り手は形を当てるまで送り続ける（実測 2026-08-28: `description` が 51 字で 1 字だけ
 * 超過し続け、`send-question` 11回中5回が 400。何を削れば通るのか掴めず、`header` 3 字・
 * `question` 6 字といった極端に短い問いを投げて当てにいく挙動になった）。
 */

const VALID = {
  header: '保存の方式',
  detail: 'ここまでに決まったこと: 記録はファイルに置く。',
  question: '保存方式をどうするか',
  options: [
    { label: '同期で書く', description: '書き終わるまで待つ', recommended: true },
    { label: '非同期で書く', description: '待たずに返す' },
  ],
}

describe('questionViolations', () => {
  it('通る問いには何も言わない', () => {
    expect(questionViolations(VALID)).toEqual([])
  })

  it('選択肢の説明が 1 字超えたら、その位置と現在の字数を返す', () => {
    const violations = questionViolations({
      ...VALID,
      options: [{ label: 'a', description: 'あ'.repeat(51) }],
    })

    expect(violations).toHaveLength(1)
    // 「どの選択肢の」「どの項目が」超えたのかが分かる
    expect(violations[0]).toContain('options.0.description')
    // あと何字削ればよいかが一目で分かる
    expect(violations[0]).toContain('現在 51')
  })

  it('問い本文の超過も同じ形で返す', () => {
    const violations = questionViolations({ ...VALID, question: 'あ'.repeat(21) })

    expect(violations[0]).toContain('question')
    expect(violations[0]).toContain('現在 21')
  })

  it('選択肢が多すぎる場合は件数を返す', () => {
    const options = Array.from({ length: 6 }, (_, at) => ({
      label: `選択肢${at}`,
      description: '説明',
    }))

    const violations = questionViolations({ ...VALID, options })

    expect(violations[0]).toContain('options')
    expect(violations[0]).toContain('現在 6')
  })

  it('複数の違反はすべて返す。1つ直すたびに送り直させない', () => {
    const violations = questionViolations({
      header: 'あ'.repeat(13),
      detail: 'あ'.repeat(301),
      question: 'あ'.repeat(21),
      options: [{ label: 'a', description: 'あ'.repeat(51) }],
    })

    expect(violations).toHaveLength(4)
  })

  it('項目そのものが無い場合も、どこが欠けているかを返す', () => {
    const violations = questionViolations({ header: 'あ' })

    expect(violations.join(' ')).toContain('detail')
    expect(violations.join(' ')).toContain('question')
    expect(violations.join(' ')).toContain('options')
  })
})
