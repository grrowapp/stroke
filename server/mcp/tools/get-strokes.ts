import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import type { Stroke } from '#shared/stroke'
import { resolveConnection } from '../../utils/mcp/connection-table'
import { readFetchFailure } from '../../utils/mcp/fetch-failure'
import { requireConnectionSessionId } from '../../utils/mcp/require-connection'

/**
 * U3 への代行。specs `mcp/tools/strokes`。
 *
 * `errorCode` は status から導く。U3 は現行の実装では 404（セッション無し）しか返さないが、
 * 破損データ時の 500（`readStrokes` の `corrupt()`、`session-store.ts`）を `not_found` と
 * 誤ラベルしないよう、404 以外は `unexpected_status` とする（santa-method レビュー指摘）。
 */
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
    const sessionId = requireConnectionSessionId(resolveConnection(extra.requestInfo?.headers ?? {}))

    try {
      const { strokes } = await $fetch<{ strokes: Stroke[] }>(
        `/api/strokes/${encodeURIComponent(sessionId)}/strokes`,
      )
      return { status: 200, strokes }
    } catch (error) {
      const failure = readFetchFailure(error)
      const errorCode = failure.status === 404 ? 'not_found' : 'unexpected_status'
      return { status: failure.status, errorCode, error: failure.message }
    }
  },
})
