import { z } from 'zod'

/**
 * 画面から届くリクエストボディの形。
 *
 * 契約（shared/api-contract.md）に無い形は 400 で弾く。長さの上限は、単一ユーザーの MVP で
 * 起きうる範囲より十分広く、かつ子プロセスへ渡す prompt が無制限に膨らまない程度に置く。
 */

const OVERVIEW_MAX = 20000
const FREE_ANSWER_MAX = 10000
const OPTION_LABEL_MAX = 2000
const COMMENT_MAX = 5000
const QUOTE_MAX = 20000
const NEXT_STEP_MAX = 2000
const NEXT_STEPS_MAX = 50
const COMMENTS_MAX = 200
const SUMMARY_MAX = 50000
const RECORD_MAX = 500000
const PROJECT_NAME_MAX = 100

export const startSessionBody = z.object({
  overview: z.string().trim().min(1, '概要が要る。').max(OVERVIEW_MAX, '概要が長すぎる。'),
})

export const answerBody = z.object({
  answer: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('option'),
      value: z.string().trim().min(1, '回答が要る。').max(OPTION_LABEL_MAX),
    }),
    z.object({
      kind: z.literal('free'),
      value: z.string().trim().min(1, '回答が要る。').max(FREE_ANSWER_MAX, '回答が長すぎる。'),
    }),
  ]),
})

/** design.md 決定10 の5色。画面が出すものと同じ範囲に閉じる。 */
const highlightColorSchema = z.object({
  name: z.enum(['yellow', 'green', 'blue', 'pink', 'orange']),
  bg: z.string().min(1).max(200),
  border: z.string().min(1).max(200),
})

const annotationBase = {
  id: z.string().trim().min(1).max(200),
  comment: z.string().trim().min(1, '指摘の本文が要る。').max(COMMENT_MAX, '指摘が長すぎる。'),
  timestamp: z.string().trim().min(1).max(64),
}

const annotationSchema = z.discriminatedUnion('type', [
  z.object({ ...annotationBase, type: z.literal('general') }),
  z.object({
    ...annotationBase,
    type: z.literal('selection'),
    /** 引用は全文を残す（design.md 決定10） */
    selectedText: z.string().min(1, '引用が要る。').max(QUOTE_MAX),
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
  response: z.string().max(SUMMARY_MAX),
  comments: z.array(annotationSchema)
    .min(1, '指摘が1件も無い。差し戻すには指摘が要る。')
    .max(COMMENTS_MAX, '指摘が多すぎる。'),
  /** `SendBackRecord` を JSON 化したもの。中身の解釈はしない */
  annotations: z.string().max(RECORD_MAX),
  nextSteps: z.array(z.string().max(NEXT_STEP_MAX)).max(NEXT_STEPS_MAX, '手続きが多すぎる。'),
})

export const approveBody = z.object({
  projectName: z.string().trim().min(1, 'プロジェクト名が要る。').max(PROJECT_NAME_MAX),
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
