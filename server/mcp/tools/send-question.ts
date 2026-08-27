import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import { resolveConnection } from '../../utils/mcp/connection-table'
import { readFetchFailure } from '../../utils/mcp/fetch-failure'
import { requireConnectionSessionId } from '../../utils/mcp/require-connection'

const ERROR_CODE_BY_STATUS: Record<number, string> = {
  400: 'validation_error',
  404: 'session_not_found',
  409: 'phase_conflict',
}

/**
 * A5 への代行。specs `mcp/tools/question`。
 *
 * **`status` は A5 の実際の応答をそのまま持つ。** `docs/specs/api/api-contract.md` の
 * A5 は「本文なし（204）」だが、現在の実装（`server/api/strokes/[id]/question.post.ts`）は
 * `setResponseStatus(event, 200)` で 200 を返しており、契約と実装がずれている
 * （provide-operations-via-mcp 実装時に判明。ここでは実際の応答を書き換えない——ADR-0013
 * 「MCP サーバー側の事前検証・独自分岐を足してはならない」）。
 */
export default defineStrokeTool({
  description: 'ストロークの問い（またはさし戻しへの問い返し）を送る',
  // 上限は**説明として**書く。`.max()` で弾かないのは ADR-0013（MCP サーバー側の
  // 事前検証・独自分岐を足さない）に従うため。検証の正は A5（`server/utils/stroke/question.ts`）
  // に置いたまま、契約としての上限だけをエージェントへ伝える。
  //
  // 書いていなかった間、エージェントは上限を知る手立てが無く、A5 の
  // 「問いの構造として読み取れない。」だけを受け取って形を探り続けた
  // （実測 2026-08-27: send-question 13回中8回が 400。内容のある問いが弾かれ、
  // 通ったのは「テスト」のような短い問いだけだった）。
  inputSchema: {
    header: z.string().describe('見出し。12文字以内'),
    detail: z.string().describe('問いに至った経緯と、何が決まって何が未確定かの説明。300文字以内'),
    question: z.string().describe('問いの本文。20文字以内'),
    options: z.array(z.object({
      label: z.string().describe('選択肢の短い名前'),
      description: z.string().describe('選択肢の説明。50文字以内'),
      recommended: z.boolean().optional().describe('推奨する選択肢に付ける'),
    })).describe('選択肢。1件以上5件以内'),
  },
  outputSchema: {
    status: z.number(),
    errorCode: z.string().optional(),
    error: z.string().optional(),
  },
  handler: async (args, extra) => {
    const sessionId = requireConnectionSessionId(resolveConnection(extra.requestInfo?.headers ?? {}))

    try {
      const response = await $fetch.raw(`/api/strokes/${encodeURIComponent(sessionId)}/question`, {
        method: 'POST',
        body: args,
      })
      return { status: response.status }
    } catch (error) {
      const failure = readFetchFailure(error)
      const errorCode = ERROR_CODE_BY_STATUS[failure.status] ?? 'unexpected_status'
      return { status: failure.status, errorCode, error: failure.message }
    }
  },
})
