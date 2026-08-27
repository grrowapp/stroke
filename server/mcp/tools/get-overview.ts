import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import { resolveConnection } from '../../utils/mcp/connection-table'
import { readFetchFailure } from '../../utils/mcp/fetch-failure'
import { requireConnectionSessionId } from '../../utils/mcp/require-connection'

/**
 * A1 への代行。specs `mcp/tools/overview`。
 *
 * `errorCode` は status から導く（404 以外は `unexpected_status`）。get-strokes.ts /
 * get-send-back.ts と同じ理由（santa-method レビュー指摘）。
 */
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
    const sessionId = requireConnectionSessionId(resolveConnection(extra.requestInfo?.headers ?? {}))

    try {
      const { overview } = await $fetch<{ overview: string }>(
        `/api/strokes/${encodeURIComponent(sessionId)}/overview`,
      )
      return { status: 200, overview }
    } catch (error) {
      const failure = readFetchFailure(error)
      const errorCode = failure.status === 404 ? 'not_found' : 'unexpected_status'
      return { status: failure.status, errorCode, error: failure.message }
    }
  },
})
