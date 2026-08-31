import type { z } from 'zod'

/**
 * 検証に反した箇所を、送り手が直せる1行の並びにする。
 *
 * **理由を伝えないと、送り手は形を当てるまで送り続ける。** 実測 2026-08-28: 選択肢の
 * 説明が 51 字で 1 字だけ超過し続け、`send-question` の 13回中5回が 400。何を削れば
 * 通るのか掴めず、`header` 3 字・`question` 6 字という内容を捨てた問いを投げて通し方を
 * 探る挙動になった。位置と理由を返したところ 400 は 1 件へ減り、その 1 件も次の送信で通った。
 *
 * **ここが受け口すべての共通の組み立てである**（design.md 決定7）。A5 だけ全件・他の口は
 * 先頭1件、という状態を残すと、送り手は口ごとに読み方を覚えることになる。`question.ts` と
 * `request-schemas.ts` の両方がここを通る。
 */

/** 1件の違反を「位置: 理由」の1行にする。量の違反なら現在値を添える（design.md 決定2・3） */
export function violationLines(value: unknown, issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.map((issue) => {
    const at = issue.path.join('.') || '(全体)'
    // 超過・不足は「今いくつなのか」を添える。あと幾つ削ればよいかが一目で分かる
    const actual = issue.code === 'too_big' || issue.code === 'too_small'
      ? lengthAt(value, issue.path)
      : undefined
    return actual === undefined
      ? `${at}: ${issue.message}`
      : `${at}: ${issue.message}（現在 ${actual}）`
  })
}

/**
 * 指摘された位置の実際の長さ。文字列なら字数、配列なら件数。
 *
 * `trim()` 後で数えるので、前後に空白を入れた入力では送り手の手元の字数と食い違う
 * ことがある。検証が見る値と揃えるほうを優先している（design.md Risks）。
 * path が深くて辿れなければ `undefined`——落ちるより情報が減るほうを選ぶ。
 */
function lengthAt(value: unknown, path: readonly PropertyKey[]): number | undefined {
  let at: unknown = value
  for (const key of path) {
    if (typeof at !== 'object' || at === null) return undefined
    at = (at as Record<PropertyKey, unknown>)[key]
  }
  if (typeof at === 'string') return at.trim().length
  if (Array.isArray(at)) return at.length
  return undefined
}
