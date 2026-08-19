import type { Answer, Question, SendBackPayload } from '#shared/types'

/**
 * AI へ渡すプロンプト。
 *
 * ここに書いてよいのは**応答の形式の規定**と、ユーザーが送ってきた内容だけである。
 * 何を問うか・差し戻しへどう対応するかは AI（`grilling` / `domain-modeling`）が決める。
 * 振る舞いを補う指示を足してはならない（specs/ai-invocation）。
 */

/**
 * 応答の形式。問いは規定の構造で返させ、把握完了なら proposal を書かせる。
 *
 * 構造の長さと件数は `question.ts` が検証する。ここに書く上限はその写しであり、
 * 食い違ったら `question.ts` が正。
 */
const RESPONSE_FORMAT = `
## 応答の形式

次のどちらか一方だけを返す。

### まだ問える決定が残っているとき

\`\`\`json ブロックを1つだけ置き、その中に次の構造の JSON を入れる。ブロックの外に文章を書かない。

\`\`\`json
{
  "header": "話題タグ。12字以内",
  "detail": "詳細説明。300字以内。既に確定していること、調べて分かった事実",
  "question": "問い本文。20字以内",
  "options": [
    { "label": "見出し。1〜5語", "description": "それを選ぶと何がどうなるか。50字以内", "recommended": true }
  ]
}
\`\`\`

- options は1件以上5件以内。
- recommended を付けるのは多くとも1つ。付けなくてよい。
- 推奨の根拠は書かない。

規定の長さや件数を超えたものは読み取れない応答として捨てられる。

### フロンティアが空になったとき（把握完了）

いまの作業ディレクトリ直下に \`proposal.md\` を書く。OpenSpec の proposal 形式
（\`## Why\` / \`## What Changes\` / \`## Capabilities\` / \`## Impact\`）に従う。

書き終えたら、応答の最後に次の1行だけを置く。

PROJECT_NAME: kebab-case-のプロジェクト名

このとき問いの JSON は返さない。
`.trim()

/** セッションの最初の呼び出し。概要を渡してストロークを始める。 */
export function overviewPrompt(overview: string): string {
  return [
    '次はユーザーが作りたいシステムの概要である。',
    '',
    overview,
    '',
    RESPONSE_FORMAT,
  ].join('\n')
}

/** 前の問いへの回答を渡し、次のストロークへ進める。 */
export function answerPrompt(question: Question, answer: Answer): string {
  return [
    '前の問いへの回答が届いた。',
    '',
    `問い: ${question.question}`,
    answer.kind === 'option'
      ? `回答（選択肢）: ${answer.value}`
      : `回答（自由入力）: ${answer.value}`,
    '',
    RESPONSE_FORMAT,
  ].join('\n')
}

/**
 * 差し戻しを渡す。1つに畳まず4層のまま渡す（specs/proposal-review）。
 *
 * **対応方法は書かない。** 全文を書き直すのか一部を直すのかは、指摘を読んだ AI が決める。
 */
export function sendBackPrompt(payload: SendBackPayload): string {
  const lines = [
    'proposal が差し戻された。',
    '',
    '## 要約',
    '',
    payload.response,
    '',
    '## 指摘の一覧',
    '',
  ]

  for (const comment of payload.comments) {
    if (comment.type === 'selection') {
      lines.push(`- 本文への指摘`)
      lines.push(`  - 引用: ${comment.selectedText}`)
      lines.push(`  - 指摘: ${comment.comment}`)
    } else {
      lines.push(`- 全体への指摘`)
      lines.push(`  - 指摘: ${comment.comment}`)
    }
  }

  lines.push('', '## 決定の記録', '', payload.annotations, '', '## 手続き', '')
  for (const step of payload.nextSteps) lines.push(`- ${step}`)
  lines.push('', RESPONSE_FORMAT)

  return lines.join('\n')
}

/**
 * リトライ。失敗した往復も履歴に残るため、同じ入力を送り直さず続きを促す。
 * 送り直すと、ユーザーが1回行った操作が会話上は2回入る（specs/ai-invocation）。
 */
export function continuePrompt(): string {
  return ['続きを返せ。', '', RESPONSE_FORMAT].join('\n')
}
