import { z } from 'zod'
import { violationLines } from './violations'

/**
 * 画面から届くリクエストボディの形。
 *
 * 契約（docs/specs/api/contract.md）に無い形は 400 で弾く。長さの上限は置かない。
 * 検査するのは「空でないこと」だけで、どこまで書けるかは画面と利用者に委ねる。
 */

export const startSessionBody = z.object({
  overview: z.string({ error: '概要は文字列で書く。' }).trim().min(1, '概要が要る。'),
}, { error: '概要を持つ組で送る。' })

/** U7 の入力。`{ kind, value }` そのまま（design.md: ストロークの問いも問い返しも同じ口）。 */
export const answerBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('option'),
    value: z.string({ error: '回答は文字列で書く。' }).trim().min(1, '回答が要る。'),
  }),
  z.object({
    kind: z.literal('free'),
    value: z.string({ error: '回答は文字列で書く。' }).trim().min(1, '回答が要る。'),
  }),
], { error: '回答の種別は option か free。' })

/** design.md 決定10 の5色。画面が出すものと同じ範囲に閉じる。 */
const highlightColorSchema = z.object({
  // 5色の名前そのものは shared/stroke.ts の型であり画面との契約なので、設定で増減させない
  // （design.md 決定9）
  name: z.enum(['yellow', 'green', 'blue', 'pink', 'orange'], {
    error: '色の名前は yellow・green・blue・pink・orange のいずれか。',
  }),
  bg: z.string({ error: '色の背景指定は文字列で書く。' }).min(1, '色の背景指定が要る。'),
  border: z.string({ error: '色の枠線指定は文字列で書く。' }).min(1, '色の枠線指定が要る。'),
}, { error: '色は name・bg・border を持つ組で書く。' })

const annotationBase = {
  id: z.string({ error: '指摘の id は文字列で書く。' }).trim().min(1, '指摘の id が要る。'),
  comment: z.string({ error: '指摘の本文は文字列で書く。' }).trim().min(1, '指摘の本文が要る。'),
  timestamp: z.string({ error: '指摘の時刻は文字列で書く。' }).trim().min(1, '指摘の時刻が要る。'),
}

const annotationSchema = z.discriminatedUnion('type', [
  z.object({ ...annotationBase, type: z.literal('general') }),
  z.object({
    ...annotationBase,
    type: z.literal('selection'),
    /** 引用は全文を残す（design.md 決定10） */
    selectedText: z.string({ error: '引用は文字列で書く。' }).min(1, '引用が要る。'),
    /** 生テキストにおける位置。差し戻す版に対してのみ有効 */
    startOffset: z.number({ error: '引用の開始位置が要る。' })
      .int('引用の開始位置は整数。')
      .nonnegative('引用の開始位置は0以上。'),
    endOffset: z.number({ error: '引用の終了位置が要る。' })
      .int('引用の終了位置は整数。')
      .nonnegative('引用の終了位置は0以上。'),
    highlightColor: highlightColorSchema,
  }).refine(a => a.startOffset < a.endOffset, {
    message: '引用の範囲が空か逆向きになっている。',
    path: ['endOffset'],
  }),
], { error: '指摘は general か selection のどちらかで書く。' })

export const sendBackBody = z.object({
  response: z.string({ error: '差し戻しの本文が要る（空文字でもよい）。' }),
  comments: z.array(annotationSchema, { error: '指摘の一覧が要る。' })
    .min(1, '指摘が1件も無い。差し戻すには指摘が要る。'),
  /** `SendBackRecord` を JSON 化したもの。中身の解釈はしない */
  annotations: z.string({ error: '指摘の記録（JSON 文字列）が要る。' }),
  nextSteps: z.array(z.string({ error: '次の一手は文字列で書く。' }), {
    error: '次の一手の一覧が要る（空配列でもよい）。',
  }),
}, { error: '差し戻しは response・comments・annotations・nextSteps を持つ組で送る。' })

export const approveBody = z.object({
  projectName: z.string({ error: 'プロジェクト名は文字列で書く。' }).trim().min(1, 'プロジェクト名が要る。'),
}, { error: 'プロジェクト名を持つ組で送る。' })

/**
 * A7 の入力。`projectName` は kebab-case のときだけ候補として採用する
 * （kebab-case かどうかの判定は `project.ts` の `isKebabCase`）。ここでは形だけ検証する。
 */
export const proposalSubmitBody = z.object({
  proposal: z.string({ error: 'proposal の本文は文字列で書く。' }).trim().min(1, 'proposal の本文が要る。'),
  projectName: z.string({ error: 'プロジェクト名は文字列で書く。' }).trim().optional(),
}, { error: 'proposal の本文を持つ組で送る。' })

/**
 * A8 の入力。`invocation` を指定の値に変えるだけの口。
 * 叩くのは invokeAi だけで、claude と画面は叩かない（openspec/specs/api/stroke/submission）。
 *
 * `retries` は省略可。渡されたときだけ回数を上書きする（再実行でのリセットに使う）。
 */
export const submissionBody = z.object({
  invocation: z.enum(['running', 'idle', 'failed', 'error'], {
    error: '実行の記録は running・idle・failed・error のいずれか。',
  }),
  retries: z.number({ error: '起こし直した回数は数値で指定する。' })
    .int('起こし直した回数は整数。')
    .min(0, '起こし直した回数は0以上。')
    .optional(),
}, { error: '実行の記録は invocation を持つ組で送る。' })

/**
 * A9 の入力。その実行で何が提出されたかを渡す。
 *
 * 叩くのは invokeAi だけである（openspec/specs/agent/invocation）。**決着の中身はこの引数が
 * 決める。** endpoint が状態を見て分岐を選ぶのではない——引数で制御される分岐は契約に
 * 現れるので ADR-0014 の対象外である。
 */
export const settlementBody = z.object({
  submitted: z.enum(['question', 'proposal'], {
    error: '提出されたものは question・proposal のいずれか。',
  }),
}, { error: '決着は submitted を持つ組で送る。' })

/**
 * 契約に合わないボディは 400。**反した箇所はすべて返す。**
 *
 * 先頭1件だけを返していた頃は、送り手が1つ直しては送り直すことを繰り返した。往復のたびに
 * 時間と実行が費やされる（openspec/specs/api/request-validation「違反はすべて返す」）。
 *
 * 組み立ては A5 と同じものを使う（`violations.ts`・design.md 決定7）。どの受け口に当たったかで
 * 返る形が変わる理由が無い。
 *
 * `data.path` は持たない。全件になると1本の path では表せず、位置は本文の各行が持っている。
 * 読み手（`useAgentQuestion` / `useProposalReview`）は `statusMessage` と `message` しか
 * 見ていないことを確認済み（design.md 決定7）。
 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (parsed.success) return parsed.data
  const violations = violationLines(body, parsed.error.issues)
  throw createError({
    statusCode: 400,
    statusMessage: 'Bad Request',
    // 先頭に一文を足さない。A5（`question.post.ts`）が `問いの構造として読み取れない。` を
    // 残しているのは、契約と既存テストが見ている文言だからで（design.md 決定5）、こちらには
    // 対応する一文が無い。無い文を作ると、送り手に読ませる情報が1行増えるだけになる
    message: violations.length === 0
      ? 'リクエストの形が違う。'
      : violations.join(' / '),
  })
}
