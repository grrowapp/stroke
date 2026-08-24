import { z } from 'zod'

/**
 * 画面から届くリクエストボディの形。
 *
 * 契約（docs/specs/api/api-contract.md）に無い形は 400 で弾く。長さの上限は置かない。
 * 検査するのは「空でないこと」だけで、どこまで書けるかは画面と利用者に委ねる。
 */

export const startSessionBody = z.object({
  overview: z.string().trim().min(1, '概要が要る。'),
})

/** U7 の入力。`{ kind, value }` そのまま（design.md: ストロークの問いも問い返しも同じ口）。 */
export const answerBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('option'),
    value: z.string().trim().min(1, '回答が要る。'),
  }),
  z.object({
    kind: z.literal('free'),
    value: z.string().trim().min(1, '回答が要る。'),
  }),
])

/** design.md 決定10 の5色。画面が出すものと同じ範囲に閉じる。 */
const highlightColorSchema = z.object({
  // 5色の名前そのものは shared/stroke.ts の型であり画面との契約なので、設定で増減させない
  // （design.md 決定9）
  name: z.enum(['yellow', 'green', 'blue', 'pink', 'orange']),
  bg: z.string().min(1),
  border: z.string().min(1),
})

const annotationBase = {
  id: z.string().trim().min(1),
  comment: z.string().trim().min(1, '指摘の本文が要る。'),
  timestamp: z.string().trim().min(1),
}

const annotationSchema = z.discriminatedUnion('type', [
  z.object({ ...annotationBase, type: z.literal('general') }),
  z.object({
    ...annotationBase,
    type: z.literal('selection'),
    /** 引用は全文を残す（design.md 決定10） */
    selectedText: z.string().min(1, '引用が要る。'),
    /** 生テキストにおける位置。差し戻す版に対してのみ有効 */
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    highlightColor: highlightColorSchema,
  }).refine(a => a.startOffset < a.endOffset, {
    message: '引用の範囲が空か逆向きになっている。',
    path: ['endOffset'],
  }),
])

export const sendBackBody = z.object({
  response: z.string(),
  comments: z.array(annotationSchema)
    .min(1, '指摘が1件も無い。差し戻すには指摘が要る。'),
  /** `SendBackRecord` を JSON 化したもの。中身の解釈はしない */
  annotations: z.string(),
  nextSteps: z.array(z.string()),
})

export const approveBody = z.object({
  projectName: z.string().trim().min(1, 'プロジェクト名が要る。'),
})

/**
 * A7 の入力。`projectName` は kebab-case のときだけ候補として採用する
 * （kebab-case かどうかの判定は `project.ts` の `isKebabCase`）。ここでは形だけ検証する。
 */
export const proposalSubmitBody = z.object({
  proposal: z.string().trim().min(1, 'proposal の本文が要る。'),
  projectName: z.string().trim().optional(),
})

/** 契約に合わないボディは 400。最初の問題だけを画面へ返す。 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (parsed.success) return parsed.data
  const issue = parsed.error.issues[0]
  throw createError({
    statusCode: 400,
    statusMessage: 'Bad Request',
    message: issue ? `${issue.message}` : 'リクエストの形が違う。',
    data: { path: issue?.path ?? [] },
  })
}
