import { parseBody, submissionBody } from '../../../utils/stroke/request-schemas'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { writeInvocation } from '../../../utils/stroke/session-store'

/**
 * A8: 実行の記録（`invocation`）を指定の値に変える。
 *
 * これが `invocation` の**唯一の書き込み口**である（openspec/specs/agent/invocation）。
 * 叩くのは invokeAi だけで、claude（エージェント）と画面は叩かない。値の意味づけも
 * 遷移の判定もここでは持たない——渡された値をそのまま書くだけである。
 *
 * 書き込みの規則は `session-store.ts` の `writeInvocation` に置いてある。invokeAi へ渡す
 * 書き込み口（`invoke.ts`）も同じ実体を呼ぶので、規則が2箇所に分かれない。
 *
 * `retries` は省略可。渡されたときだけ回数を上書きする（`error` からの再実行で 0 に
 * 戻すのに使う）。存在しない id は `requireSessionId` が 404 にする。
 */
export default defineEventHandler(async (event): Promise<Response> => {
  const sessionId = await requireSessionId(event)
  const { invocation, retries } = parseBody(submissionBody, await readBody(event))

  await writeInvocation(sessionId, invocation, retries)

  return new Response(null, { status: 204 })
})
