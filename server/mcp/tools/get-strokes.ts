import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import type { Stroke } from '#shared/stroke'
import { resolveConnection } from '../../utils/mcp/connection-table'
import { readFetchFailure } from '../../utils/mcp/fetch-failure'
import { resolveConnectionSessionId } from '../../utils/mcp/require-connection'

/**
 * U3 への代行。specs `mcp/tools/strokes`。
 *
 * `errorCode` は代行先の応答から導く。破損データ時の 500（`readStrokes` の `corrupt()`、
 * `session-store.ts`）を `session_not_found` と誤ラベルしないよう、404 以外は
 * `unexpected_status` とする（santa-method レビュー指摘）。
 *
 * 404 に `session_not_found` を使う理由は get-overview.ts と同じ（全ツールで同じ値）。
 *
 * **404 の中でも、既知の文言でないものは `session_not_found` に寄せない。** ルート不一致
 * などの見覚えのない 404 まで「そのセッションは無い」に畳むと、受け手は存在しない原因を
 * 直そうとする（specs `mcp/server`「契約に載せた状況へ無理に寄せてはならない」MUST NOT）。
 * U3 が 404 を返す経路は現状 `requireSessionId` の1本だけなので既知の文言も1つだが、
 * 守りの理由は get-overview.ts / get-send-back.ts と同じである
 * （santa-method レビュー指摘 7周目 2026-08-30）。
 *
 * 成功の `status` は U3 の実際の応答をそのまま持つ。そのために `$fetch.raw` を使う
 * ——理由は get-overview.ts と同じ（santa-method レビュー指摘 4周目 2026-08-30）。
 */
// プロトタイプを持たせない理由は get-overview.ts と同じ（santa-method レビュー指摘 6周目）
const ERROR_CODE_BY_404_MESSAGE: Record<string, string> = Object.assign(Object.create(null), {
  // `server/utils/stroke/session-param.ts` の `requireSessionId`
  'そのセッションは無い。': 'session_not_found',
})

export default defineStrokeTool({
  description: '済んだストロークの記録（時系列順。末尾が直前の回答）を取得する',
  inputSchema: {},
  outputSchema: {
    status: z.number(),
    strokes: z.array(z.unknown()).optional(),
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
      const response = await $fetch.raw<{ strokes: Stroke[] }>(
        `/api/sessions/${encodeURIComponent(connected.sessionId)}/strokes`,
      )
      return { status: response.status, strokes: response._data?.strokes }
    } catch (error) {
      const failure = readFetchFailure(error)
      if (failure.status !== 404) {
        return { status: failure.status, errorCode: 'unexpected_status', error: failure.message }
      }
      // 見覚えのない 404 は `session_not_found` に寄せず `unexpected_status`（理由は冒頭）。
      const errorCode = ERROR_CODE_BY_404_MESSAGE[failure.message] ?? 'unexpected_status'
      return { status: 404, errorCode, error: failure.message }
    }
  },
})
