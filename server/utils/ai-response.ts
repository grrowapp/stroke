import type { Question } from '#shared/types'
import { parseQuestion } from './question'

/**
 * `claude -p` の標準出力から、規定の構造を読み取る。
 *
 * 受け取り口は標準出力だけ。CLI のセッションログ（`.jsonl`）は開かない（specs/ai-invocation）。
 *
 * 読み取れなかったものは黙って捨てず null を返す。呼び出し側がそれを失敗として扱い、
 * リトライへ流す。画面に出ない説明が回答の前提になってはならないため、規定の構造で
 * 受け取れなかった応答を問いとして提示することはない（specs/stroke-session）。
 */

/** 把握完了のとき、AI が応答の末尾に置く行。 */
const PROJECT_NAME_LINE = /^PROJECT_NAME:\s*(\S+)\s*$/m

/**
 * 応答から問いを読み取る。
 *
 * 応答は ```json ブロック1つを想定するが、ブロックの体裁が崩れることがあるため、
 * 波括弧で囲まれた最大の範囲も候補にする。どちらも規定を満たさなければ null。
 */
export function parseQuestionResult(result: string): Question | null {
  for (const candidate of jsonCandidates(result)) {
    let value: unknown
    try {
      value = JSON.parse(candidate)
    } catch {
      continue
    }
    const question = parseQuestion(value)
    if (question) return question
  }
  return null
}

/**
 * 応答から kebab-case のプロジェクト名を読み取る。無ければ undefined。
 *
 * 名前はユーザーが画面2で書き換えて確定するもので、AI が出すのは候補にすぎない。
 * 取れなかったことを失敗にはしない（specs/proposal-review）。
 */
export function parseProjectName(result: string): string | undefined {
  const matched = PROJECT_NAME_LINE.exec(result)
  if (!matched) return undefined
  const name = matched[1]
  if (name === undefined) return undefined
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) ? name : undefined
}

/** 読み取りを試す順に JSON らしき文字列を並べる。 */
function* jsonCandidates(result: string): Generator<string> {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/g
  let matched: RegExpExecArray | null
  while ((matched = fenced.exec(result)) !== null) {
    const body = matched[1]
    if (body !== undefined) yield body.trim()
  }

  const trimmed = result.trim()
  if (trimmed !== '') yield trimmed

  const first = result.indexOf('{')
  const last = result.lastIndexOf('}')
  if (first !== -1 && last > first) yield result.slice(first, last + 1)
}
