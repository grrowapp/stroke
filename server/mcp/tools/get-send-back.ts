import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import type { SendBackPayload } from '#shared/stroke'
import { resolveConnection } from '../../utils/mcp/connection-table'
import { readFetchFailure } from '../../utils/mcp/fetch-failure'
import { requireConnectionSessionId } from '../../utils/mcp/require-connection'

/**
 * A4 への代行。specs `mcp/tools/send-back`。
 *
 * A4 はセッション無し・差し戻し無しをどちらも 404 で返し、メッセージ本文でしか区別できない
 * （`server/api/strokes/[id]/send-back.get.ts`）。文言照合は `claude.ts` の
 * `CLAUDE_SESSION_MISSING_MESSAGE` と同じ立ち位置——endpoint が文言を変えたら追随させる。
 *
 * **文言照合は status: 404 のときだけ行う。** 破損データ時の 500（`readSendBack` の
 * `corrupt()`、`session-store.ts`）は文言が一致しないため、素通しすると誤って
 * `no_send_back` にフォールバックしてしまう（santa-method レビュー指摘）。404 以外は
 * `unexpected_status` とする。
 */
const SESSION_NOT_FOUND_MESSAGE = 'そのセッションは無い。'

export default defineStrokeTool({
  description: '差し戻し（ユーザーが proposal を承認せず修正を求めて返した指摘一式）を取得する',
  inputSchema: {},
  outputSchema: {
    status: z.number(),
    response: z.string().optional(),
    comments: z.array(z.unknown()).optional(),
    annotations: z.string().optional(),
    nextSteps: z.array(z.string()).optional(),
    errorCode: z.string().optional(),
    error: z.string().optional(),
  },
  handler: async (_args, extra) => {
    const sessionId = requireConnectionSessionId(resolveConnection(extra.requestInfo?.headers ?? {}))

    try {
      const payload = await $fetch<SendBackPayload>(
        `/api/strokes/${encodeURIComponent(sessionId)}/send-back`,
      )
      return { status: 200, ...payload }
    } catch (error) {
      const failure = readFetchFailure(error)
      if (failure.status !== 404) {
        return { status: failure.status, errorCode: 'unexpected_status', error: failure.message }
      }
      const errorCode = failure.message === SESSION_NOT_FOUND_MESSAGE ? 'session_not_found' : 'no_send_back'
      return { status: 404, errorCode, error: failure.message }
    }
  },
})
