import { z } from 'zod'
import type { Question, QuestionOption } from '#shared/stroke'

/**
 * 問いの構造は、AI の応答からも `state.json` / `strokes.json` からも組み立てる。
 * 不変条件（選択肢が1件以上5件以下・推奨は多くとも1つ）を2箇所で書くと
 * 強度がずれるため、組み立てはここ1箇所に集約する。
 *
 * 長さと件数の規定はここに置く。超えたものは「規定の構造として読み取れない」に倒し、
 * AI 応答ならリトライへ、保存済みなら壊れた記録として弾く（design.md 決定3・決定4）。
 *
 * 長さと件数は「規定の構造として読み取れるか」を決める契約であって、運用で差し替える設定
 * ではない。値は外に出さず、schema の定義として直接書く。
 */

const rawOptionSchema = z.object({
  // label に文字数の上限は置かない。「1〜5語」は形式の規定として prompt の文言だけで
  // 伝える（AskUserQuestion 自身がハード上限を持たないのに合わせる・design.md 決定2）。
  label: z.string().trim().min(1),
  // 選択肢の説明。50字。
  description: z.string().trim().min(1).max(50),
  recommended: z.boolean().optional(),
})

const rawQuestionSchema = z.object({
  // 話題タグ。12字（AskUserQuestion の header に合わせる）。
  header: z.string().trim().min(1).max(12),
  // 詳細説明。300字。
  detail: z.string().trim().min(1).max(300),
  // 問い本文。20字。
  question: z.string().trim().min(1).max(20),
  // 選択肢の件数。1件以上5件以下。
  options: z.array(rawOptionSchema).min(1).max(5),
})

/**
 * 読み取れなかった理由を、項目ごとに1行で述べる。
 *
 * **理由を伝えないと、エージェントは形を当てるまで送り続ける。** 「問いの構造として
 * 読み取れない。」だけでは、どの項目がどの制約に反したのか分からない（実測 2026-08-28:
 * `description` が 51 字で 1 字だけ超過し続け、`send-question` 11回中5回が 400。
 * 何を削れば通るのか掴めず、`header` 3 字・`question` 6 字といった極端に短い問いを
 * 投げて当てにいく挙動になった）。
 *
 * 上限そのものはツールの `inputSchema` の説明にも書いてあるが（ADR-0013 により
 * MCP 側では弾かない）、実際に超えたときは**どれが何字なのか**を返す必要がある。
 */
export function questionViolations(value: unknown): string[] {
  const parsed = rawQuestionSchema.safeParse(value)
  if (parsed.success) return []

  return parsed.error.issues.map((issue) => {
    const at = issue.path.join('.') || '(全体)'
    // 超過は「今いくつなのか」を添える。あと何字削ればよいかが一目で分かる
    const actual = issue.code === 'too_big' || issue.code === 'too_small'
      ? lengthAt(value, issue.path)
      : undefined
    return actual === undefined
      ? `${at}: ${issue.message}`
      : `${at}: ${issue.message}（現在 ${actual}）`
  })
}

/** 指摘された位置の実際の長さ。文字列なら字数、配列なら件数 */
function lengthAt(value: unknown, path: PropertyKey[]): number | undefined {
  let at: unknown = value
  for (const key of path) {
    if (typeof at !== 'object' || at === null) return undefined
    at = (at as Record<PropertyKey, unknown>)[key]
  }
  if (typeof at === 'string') return at.trim().length
  if (Array.isArray(at)) return at.length
  return undefined
}

/**
 * 規定の構造として読み取る。読み取れなければ null。
 * 呼び出し側はそれを失敗としてリトライへ流す（AI 応答）か、壊れた記録として弾く（保存分）。
 */
export function parseQuestion(value: unknown): Question | null {
  const parsed = rawQuestionSchema.safeParse(value)
  if (!parsed.success) return null

  const options: QuestionOption[] = []
  let recommendedTaken = false
  for (const option of parsed.data.options) {
    // 推奨は多くとも1つ。2件目以降の推奨は推奨として扱わない。
    const recommended = option.recommended === true && !recommendedTaken
    if (recommended) recommendedTaken = true
    options.push({
      label: option.label,
      description: option.description,
      ...(recommended ? { recommended: true } : {}),
    })
  }

  return {
    header: parsed.data.header,
    detail: parsed.data.detail,
    question: parsed.data.question,
    options,
  }
}

/** `strokes.json` に入っている問いなど、既に検証済みのものを読み直すときのスキーマ。 */
export const questionSchema = z.unknown().transform((value, ctx) => {
  const question = parseQuestion(value)
  if (!question) {
    ctx.addIssue({ code: 'custom', message: '問いの構造として読み取れない' })
    return z.NEVER
  }
  return question
})
