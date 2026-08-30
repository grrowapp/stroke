import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import { resolveConnection } from '../../utils/mcp/connection-table'
import { readFetchFailure } from '../../utils/mcp/fetch-failure'
import { resolveConnectionSessionId } from '../../utils/mcp/require-connection'

/**
 * A1 への代行。specs `mcp/tools/overview`。
 *
 * `errorCode` は代行先の応答から導く（404 以外は `unexpected_status`）。get-strokes.ts /
 * get-send-back.ts と同じ理由（santa-method レビュー指摘）。
 *
 * 対象のセッションが無い 404 は `session_not_found`。全ツールで同じ値にする
 * ——specs `mcp/server`「同じ状況には全ツールで同じ `errorCode` を使う」。以前は
 * このツールと get-strokes だけが `not_found` を返しており、同一の失敗に2つの名前が
 * あった（santa-method レビュー指摘 3周目 2026-08-30）。
 *
 * A1 はセッション無し・概要無しをどちらも 404 で返し、メッセージ本文でしか区別できない
 * （`server/api/strokes/[id]/overview.get.ts` の `requireSessionId` と `readOverview`）。
 * 意味の違う2つを同じ `errorCode` に畳むと、受け手は存在しない原因を直そうとする
 * （specs `mcp/server`「契約に載せた状況へ無理に寄せてはならない」MUST NOT。
 * santa-method レビュー指摘 4周目 2026-08-30）。文言照合は get-send-back.ts と同じ
 * 立ち位置——endpoint が文言を変えたら追随させる。
 *
 * **文言照合は status: 404 のときだけ行う。** 他の状況の 500 などは文言が一致せず、
 * 素通しすると誤って `no_overview` へフォールバックしてしまう（get-send-back.ts と
 * 同じ理由）。404 以外は `unexpected_status` とする。
 *
 * **404 の中でも、既知の2文言のどちらでもないものは `no_overview` に寄せない。**
 * ルート不一致などの見覚えのない 404 まで「概要がまだ無い」に畳むと、受け手は存在しない
 * 原因を直そうとする（specs `mcp/server`「契約に載せた状況へ無理に寄せてはならない」
 * MUST NOT。500 を `unexpected_status` へ倒したのと同じ理由が 404 の中にも要る。
 * santa-method レビュー指摘 5周目 2026-08-30）。get-send-back.ts と同じ形にしてある。
 *
 * 成功の `status` は A1 の**実際の応答**をそのまま持つ（`mcp/server`「代行先が応答を
 * 返したなら、その status を保持する」SHALL）。そのために本文だけを受ける `$fetch` では
 * なく `$fetch.raw` を使う——`send-question.ts` / `submit-document.ts` と同じ形。以前
 * 置いていた `status: 200` の定数は、A1 がたまたまそう返すのと一致していただけで導出では
 * なかった（santa-method レビュー指摘 4周目 2026-08-30）。
 */
// **プロトタイプを持たせない。** 素のオブジェクトだと、文言が `toString` や `constructor`
// のときに `Object.prototype` のメンバ（関数）が返り、`?? ` は undefined しか拾わないので
// 既定値に落ちない。`errorCode` が関数になると `outputSchema` の検証で弾かれ、`status` も
// 持たない結果になる（santa-method レビュー指摘 6周目 2026-08-30）
const ERROR_CODE_BY_404_MESSAGE: Record<string, string> = Object.assign(Object.create(null), {
  // `server/utils/stroke/session-param.ts` の `requireSessionId`
  'そのセッションは無い。': 'session_not_found',
  // `server/api/strokes/[id]/overview.get.ts`
  '概要がまだ無い。': 'no_overview',
})

export default defineStrokeTool({
  description: '概要（ユーザーが最初に投げた、作りたいシステムの説明）を取得する',
  inputSchema: {},
  outputSchema: {
    status: z.number(),
    overview: z.string().optional(),
    errorCode: z.string().optional(),
    error: z.string().optional(),
  },
  handler: async (_args, extra) => {
    // token の欠落・不一致も throw せず平坦なエラーで返す（理由は `connection-table.ts`）。
    const resolved = resolveConnection(extra.requestInfo?.headers ?? {})
    if (!resolved.ok) {
      return { status: resolved.status, errorCode: resolved.errorCode, error: resolved.error }
    }

    // 工程の食い違いは throw せず平坦なエラーで返す（理由は `require-connection.ts`）。
    const connected = resolveConnectionSessionId(resolved.context)
    if (!connected.ok) {
      return { status: connected.status, errorCode: connected.errorCode, error: connected.error }
    }

    try {
      const response = await $fetch.raw<{ overview: string }>(
        `/api/strokes/${encodeURIComponent(connected.sessionId)}/overview`,
      )
      return { status: response.status, overview: response._data?.overview }
    } catch (error) {
      const failure = readFetchFailure(error)
      if (failure.status !== 404) {
        return { status: failure.status, errorCode: 'unexpected_status', error: failure.message }
      }
      // 見覚えのない 404 は `no_overview` に寄せず `unexpected_status`（理由は冒頭）。
      const errorCode = ERROR_CODE_BY_404_MESSAGE[failure.message] ?? 'unexpected_status'
      return { status: 404, errorCode, error: failure.message }
    }
  },
})
