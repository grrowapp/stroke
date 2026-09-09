import { describe, expect, it } from 'vitest'

import {
  answerBody,
  parseBody,
  sendBackBody,
  startSessionBody,
  submissionBody,
} from '../../../../server/utils/stroke/request-schemas'

/**
 * 受け口の入力検証と、その失敗の伝え方（`openspec/specs/api/request-validation`）。
 *
 * 見るのは3つ。**違反が全件返ること**（1件ずつ返すと、送り手は直しては送り直す往復を
 * 繰り返す）、**量の違反に現在値が添うこと**（あと幾つ削ればよいかが決まる）、
 * **検証の仕組みの言葉が漏れないこと**（既定文が出ると何の項目かも幾つなのかも分からない）。
 *
 * 文言の全文一致では見ない。文面はメッセージを直すたびに変わるので、テストが文言の
 * 資産になると直せなくなる（design.md Risks）。見るのは「どの項目が出るか」と
 * 「現在値が出るか」である。
 */

/** zod の既定文（英語）に必ず現れる語。1つでも混じれば既定文が漏れている */
const DEFAULT_MARKERS = [
  'Invalid', 'Expected', 'expected', 'Too big', 'Too small', 'Required', 'received',
]

/** `parseBody` が投げた 400 の本文を取り出す */
function messageOf(schema: Parameters<typeof parseBody>[0], body: unknown): string {
  try {
    parseBody(schema, body)
  } catch (error) {
    return String((error as { message?: unknown }).message ?? '')
  }
  throw new Error('検証を通ってしまった')
}

describe('parseBody', () => {
  it('通るボディはそのまま返す', () => {
    expect(parseBody(startSessionBody, { overview: '作りたいもの' }))
      .toEqual({ overview: '作りたいもの' })
  })

  it('違反が複数あるとき、すべてを返す', () => {
    const message = messageOf(sendBackBody, {
      response: '',
      comments: [],
      annotations: '{}',
      nextSteps: [],
    })

    // 空の指摘一覧に加えて、他の項目の違反も一度に届く
    expect(message).toContain('comments')
    // 1件だけで打ち切っていない
    expect(message.split(' / ').length).toBeGreaterThan(0)
  })

  it('複数の項目が同時に反していれば、そのすべてが出る', () => {
    const message = messageOf(submissionBody, { invocation: 'nope', retries: -1 })

    expect(message).toContain('invocation')
    expect(message).toContain('retries')
    expect(message.split(' / ')).toHaveLength(2)
  })

  it('違反した位置が読み取れる', () => {
    expect(messageOf(startSessionBody, { overview: '   ' })).toContain('overview')
  })

  it('件数の違反には現在の件数が添う', () => {
    const message = messageOf(sendBackBody, {
      response: '',
      comments: [],
      annotations: '{}',
      nextSteps: [],
    })

    expect(message).toContain('現在 0')
  })

  it('検証の仕組みの言葉が漏れない', () => {
    const messages = [
      messageOf(startSessionBody, {}),
      messageOf(startSessionBody, { overview: 1 }),
      messageOf(answerBody, { kind: 'nope', value: 'x' }),
      messageOf(answerBody, { kind: 'free', value: '' }),
      messageOf(submissionBody, { invocation: 'idle', retries: '3' }),
      messageOf(sendBackBody, {}),
    ]

    for (const message of messages) {
      for (const marker of DEFAULT_MARKERS) {
        expect(message).not.toContain(marker)
      }
    }
  })

  it('メッセージ自身が違反の区切りを含まない', () => {
    // 区切りは `' / '` である（design.md 決定4）。メッセージの中に同じ並びを書くと、
    // 読み手は何件の違反なのかを数えられなくなる。実際に踏んだ:
    // `実行の記録は running / idle / failed / error のいずれか。` が4つに割れて見えた
    const messages = [
      messageOf(submissionBody, { invocation: 'nope' }),
      messageOf(sendBackBody, 'ただの文字列'),
      messageOf(answerBody, { kind: 'nope', value: 'x' }),
    ]

    for (const message of messages) {
      expect(message).not.toContain(' / ')
    }
  })

  it('位置を辿れない違反でも、理由だけは返る', () => {
    // ボディが組ですらない。項目の位置は無いが、何を送るべきかは伝わる
    const message = messageOf(startSessionBody, 'ただの文字列')
    expect(message).not.toBe('')
    for (const marker of DEFAULT_MARKERS) {
      expect(message).not.toContain(marker)
    }
  })
})
