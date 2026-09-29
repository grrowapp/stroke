import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import type { SendBackPayload } from '#shared/stroke'
import { resolveConnection } from '../../utils/mcp/connection-table'
import { readFetchFailure } from '../../utils/mcp/fetch-failure'
import { resolveConnectionSessionId } from '../../utils/mcp/require-connection'
import { internalFetch } from '../../utils/access/request'

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
 *
 * **404 の中でも、既知の2文言のどちらでもないものは `no_send_back` に寄せない。**
 * ルート不一致などの見覚えのない 404 まで「差し戻しはまだ無い」に畳むと、受け手は
 * 存在しない原因を直そうとする（specs `mcp/server`「契約に載せた状況へ無理に寄せては
 * ならない」MUST NOT。santa-method レビュー指摘 5周目 2026-08-30）。get-overview.ts と
 * 同じ形にしてある。
 *
 * 成功の `status` は A4 の実際の応答をそのまま持つ。そのために `$fetch.raw` を使う
 * ——理由は get-overview.ts と同じ（santa-method レビュー指摘 4周目 2026-08-30）。
 */
// プロトタイプを持たせない理由は get-overview.ts と同じ（santa-method レビュー指摘 6周目）
const ERROR_CODE_BY_404_MESSAGE: Record<string, string> = Object.assign(Object.create(null), {
  // `server/utils/stroke/session-param.ts` の `requireSessionId`
  'そのセッションは無い。': 'session_not_found',
  // `server/api/strokes/[id]/send-back.get.ts`
  '差し戻しはまだ無い。': 'no_send_back',
})

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
      const response = await internalFetch.raw<SendBackPayload>(
        `/api/strokes/${encodeURIComponent(connected.sessionId)}/send-back`,
      )
      // **`status` を後ろに置く。** 前に置くと、A4 の本文に `status` が入っていたとき
      // スプレッドが自分の `status` を潰す。潰れた値が数値でなければ `outputSchema` の
      // 検証に落ち、`status` を持たない `isError` テキストになる——`mcp/server` の
      // 「常に `status` を持つ」は無条件（santa-method レビュー指摘 7周目 2026-08-30）。
      // いまの A4 の本文は `sendBackBody` で検証済みで `status` を持たないが、代行先の
      // 本文の形に不変条件を預けない
      return { ...response._data, status: response.status }
    } catch (error) {
      const failure = readFetchFailure(error)
      if (failure.status !== 404) {
        return { status: failure.status, errorCode: 'unexpected_status', error: failure.message }
      }
      // 見覚えのない 404 は `no_send_back` に寄せず `unexpected_status`（理由は冒頭）。
      const errorCode = ERROR_CODE_BY_404_MESSAGE[failure.message] ?? 'unexpected_status'
      return { status: 404, errorCode, error: failure.message }
    }
  },
})
