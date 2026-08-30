import { z } from 'zod'
import type { Question, QuestionOption } from '#shared/stroke'
import { violationLines } from './violations'

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

// **制約ごとにメッセージを書く**（openspec/specs/api/request-validation）。既定文に委ねると
// 送り手には `Too big: expected string to have <=50 characters` が届き、何の項目かも、いま
// 幾つなのかも分からない。メッセージは制約と同じ行に置く——別の辞書に持つと、制約を変えた
// ときにメッセージが取り残される（design.md 決定6）。

// **型違い・欠落にもメッセージを置く。** 制約（`.max()` など）だけに書いても、値が数値や
// undefined で届いたときは基底の型の既定文（`Invalid input: expected string, received number`）が
// そのまま出る。`z.string({ error })` の形で基底にも書く。

const rawOptionSchema = z.object({
  // label に文字数の上限は置かない。「1〜5語」は形式の規定として prompt の文言だけで
  // 伝える（AskUserQuestion 自身がハード上限を持たないのに合わせる・design.md 決定2）。
  label: z.string({ error: '選択肢のラベルは文字列で書く。' }).trim()
    .min(1, '選択肢のラベルが空。1〜5語で書く。'),
  // 選択肢の説明。50字。
  description: z.string({ error: '選択肢の説明は文字列で書く。' }).trim()
    .min(1, '選択肢の説明が空。')
    .max(50, '選択肢の説明は50字まで。'),
  recommended: z.boolean({ error: '推奨は true か false で指定する。' }).optional(),
}, { error: '選択肢は label と description を持つ組で書く。' })

const rawQuestionSchema = z.object({
  // 話題タグ。12字（AskUserQuestion の header に合わせる）。
  header: z.string({ error: '話題タグは文字列で書く。' }).trim()
    .min(1, '話題タグが空。')
    .max(12, '話題タグは12字まで。'),
  // 詳細説明。300字。
  detail: z.string({ error: '詳細説明は文字列で書く。' }).trim()
    .min(1, '詳細説明が空。')
    .max(300, '詳細説明は300字まで。'),
  // 問い本文。20字。
  question: z.string({ error: '問い本文は文字列で書く。' }).trim()
    .min(1, '問い本文が空。')
    .max(20, '問い本文は20字まで。'),
  // 選択肢の件数。1件以上5件以下。
  options: z.array(rawOptionSchema, { error: '選択肢は一覧で書く。' })
    .min(1, '選択肢が1件も無い。1件以上5件以下で出す。')
    .max(5, '選択肢は5件まで。'),
}, { error: '問いは header・detail・question・options を持つ組で書く。' })

/**
 * 読み取れなかった理由を、項目ごとに1行で述べる。
 *
 * **理由を伝えないと、エージェントは形を当てるまで送り続ける。** 「問いの構造として
 * 読み取れない。」だけでは、どの項目がどの制約に反したのか分からない（実測 2026-08-28:
 * `description` が 51 字で 1 字だけ超過し続け、`send-question` 11回中5回が 400。
 * 何を削れば通るのか掴めず、`header` 3 字・`question` 6 字といった極端に短い問いを
 * 投げて当てにいく挙動になった）。
 *
 * 上限そのものはツールの `inputSchema` の説明にも書いてあるが（ADR-0014 により
 * MCP 側では弾かない）、実際に超えたときは**どれが何字なのか**を返す必要がある。
 */
export function questionViolations(value: unknown): string[] {
  const parsed = rawQuestionSchema.safeParse(value)
  if (parsed.success) return []
  // 組み立ては受け口すべてで共通（design.md 決定7）。ここに置いたまま `parseBody` から
  // import させるのではなく、双方が `violations.ts` を通る
  return violationLines(value, parsed.error.issues)
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
