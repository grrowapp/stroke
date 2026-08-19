import { readClaudeConfig } from './claude-config'

/**
 * AI へ渡すプロンプト。
 *
 * 固定テンプレート1本。差し込みはセッション URL の1点だけで、ユーザー入力は埋め込まない
 * （design.md 決定5）。何を問うか・差し戻しへどう対応するかは AI が、この URL から自分で
 * 取得先を読んで決める。振る舞いを補う指示を足してはならない（specs/ai-invocation）。
 */

/** セッションの最初の呼び出しから、リトライ以外の全呼び出しで使う固定テンプレート。 */
export function sessionPrompt(sessionId: string): string {
  const base = `${readClaudeConfig().apiBaseUrl}/api/${sessionId}`

  return `
次のセッションを進める。

## 取得先

- 概要: GET ${base}/overview
- 済んだストロークの記録（末尾が直前の回答）: GET ${base}/strokes
- 差し戻しの指摘一式（差し戻しが無ければ 404）: GET ${base}/send-back

取得は保存済みのものを返すだけで、状況による判定は行わない。まず取得先を読んで、
今どこまで決まっているかを把握してから進めること。

## 提出先

まだ問える決定が残っているとき、次の構造の JSON を POST する。

POST ${base}/question

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
- recommended を付けるのは多くとも1つ。付けなくてよい。推奨の根拠は書かない。
- 差し戻しへの問い返しも、ストロークの問いと同じこの口で提出する。区別しなくてよい。
- 規定の長さや件数を超えたものは 400 で返る。エラーを読んで、同じ呼び出しの中で出し直すこと。

フロンティアが空になったとき（把握完了）、proposal を次の口で提出する。

POST ${base}/proposal

\`\`\`json
{
  "proposal": "OpenSpec の proposal 形式（## Why / ## What Changes / ## Capabilities / ## Impact）に従った全文（Markdown）",
  "projectName": "kebab-case のプロジェクト名の候補（省略可）"
}
\`\`\`

差し戻しへの対応方法（全文を書き直す・一部だけ直す等）は自分で判断する。追加の指示はない。
`.trim()
}

/**
 * リトライ。取得先・提出先の指示は既に渡してある（`sessionPrompt`）ので繰り返さない。
 * 失敗した往復も履歴に残るため、同じ入力を送り直さず続きを促す（specs/ai-invocation）。
 */
export function continuePrompt(): string {
  return '続きを返せ。取得先・提出先の URL は前回の指示のとおり。'
}
