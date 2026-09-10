import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import { resolveConnection } from '../../utils/mcp/connection-table'
import { readFetchFailure } from '../../utils/mcp/fetch-failure'
import { resolveConnectionSessionId } from '../../utils/mcp/require-connection'

/** 数値キーの写像なので `Object.prototype` のメンバとは衝突しない（下の 404 の写像を参照）。 */
const ERROR_CODE_BY_STATUS: Record<number, string> = {
  400: 'validation_error',
  409: 'phase_conflict',
}

/**
 * 404 は本文の文言から導く。**既知の文言でないものは `session_not_found` に寄せない。**
 *
 * ルート不一致などの見覚えのない 404 まで「そのセッションは無い」に畳むと、受け手は存在
 * しない原因を直そうとする（specs `mcp/server`「契約に載せた状況へ無理に寄せてはならない」
 * MUST NOT）。A5 が 404 を返す経路は現状 `requireSessionId` の1本だけなので既知の文言も
 * 1つだが、守りの理由は get-overview.ts / get-send-back.ts と同じである
 * （santa-method レビュー指摘 7周目 2026-08-30）。
 *
 * プロトタイプを持たせない理由は get-overview.ts と同じ（santa-method レビュー指摘 6周目）。
 */
const ERROR_CODE_BY_404_MESSAGE: Record<string, string> = Object.assign(Object.create(null), {
  // `server/utils/stroke/session-param.ts` の `requireSessionId`
  'そのセッションは無い。': 'session_not_found',
})

/**
 * A5 への代行。specs `mcp/tools/question`。
 *
 * **`status` は A5 の実際の応答をそのまま持つ。** A5 は受理と記録で完結する口なので、
 * 成功は本文なしの 204 になる（`docs/specs/api/contract.md` A5）。ここで status を
 * 読み替えたり成功の印を足したりしない——ADR-0014「MCP サーバー側の事前検証・独自分岐を
 * 足してはならない」。
 */
export default defineStrokeTool({
  description: 'ストロークの問い（またはさし戻しへの問い返し）を送る',
  // 上限は**説明として**書く。`.max()` で弾かないのは ADR-0014（MCP サーバー側の
  // 事前検証・独自分岐を足さない）に従うため。検証の正は A5（`server/utils/stroke/question.ts`）
  // に置いたまま、契約としての上限だけをエージェントへ伝える。
  //
  // 書いていなかった間、エージェントは上限を知る手立てが無く、A5 の
  // 「問いの構造として読み取れない。」だけを受け取って形を探り続けた
  // （実測 2026-08-27: send-question 13回中8回が 400。内容のある問いが弾かれ、
  // 通ったのは「テスト」のような短い問いだけだった）。
  //
  // **項目は1つも必須にしない（すべて `.optional()`）。** MCP SDK は
  // `inputSchema` をハンドラより**前**に検証し、通らなければ `McpError(InvalidParams)`
  // を投げる（`@modelcontextprotocol/sdk/dist/esm/server/mcp.js` の `validateToolInput`
  // が 174-178 行で `safeParseAsync` の失敗を投げ、その呼び出しは 125 行——ハンドラを
  // 呼ぶ 126 行より前）。モジュールの try/catch はハンドラの内側しか覆わないので
  // （`@nuxtjs/mcp-toolkit/dist/runtime/server/mcp/definitions/tools.js` 36-44 行）、
  // 必須項目を欠いた呼び出しは `status` も `errorCode` も持たない結果になり、specs
  // `mcp/server`「各ツールの結果は1階層とし、常に `status` を持つ」（無条件）と例外表の
  // 「引数が契約を満たさない → 400 `validation_error`」の両方を破る
  // （santa-method レビュー指摘 5周目 2026-08-30）。
  //
  // 欠けた項目は**そのまま A5 へ渡す**。中身の妥当性を判定するのは送信先であり、ここで
  // 止めてはならない（specs `mcp/tools/question`「ツール側で引数の値の検証を行って送信を
  // 止めてはならない」MUST NOT）。A5 が 400 と違反箇所を返し、それが `error` に載る。
  inputSchema: {
    header: z.string().optional().describe('見出し。12文字以内。省くと A5 が 400 で返す'),
    detail: z.string().optional().describe('問いに至った経緯と、何が決まって何が未確定かの説明。300文字以内。省くと A5 が 400 で返す'),
    question: z.string().optional().describe('問いの本文。20文字以内。省くと A5 が 400 で返す'),
    options: z.array(z.object({
      label: z.string().optional().describe('選択肢の短い名前'),
      description: z.string().optional().describe('選択肢の説明。50文字以内'),
      recommended: z.boolean().optional().describe('推奨する選択肢に付ける'),
    })).optional().describe('選択肢。1件以上5件以内。省くと A5 が 400 で返す'),
  },
  outputSchema: {
    status: z.number(),
    errorCode: z.string().optional(),
    error: z.string().optional(),
  },
  handler: async (args, extra) => {
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
      // `args` は手を入れずそのまま渡す。項目が欠けていても A5 へ届け、A5 の 400 と
      // 違反箇所を `error` に載せる（検証の正は送信先。ADR-0014）。
      // **接続 token をそのまま転送する。** A5 はこれで「どの起動の提出か」を記録し、
      // invokeAi が実行の決着でそれを読む（openspec/specs/agent/invocation）。ここで
      // 記録そのものを行わないのは ADR-0014——ツールは代行に徹し、判断も記録も送信先が
      // 持つ。steering の提出だけがツール側で記録するのは、受理するのが代行先（本家）で
      // stroke-board の endpoint を1つも通らないためである。
      const response = await $fetch.raw(`/api/strokes/${encodeURIComponent(connected.sessionId)}/question`, {
        method: 'POST',
        headers: { 'x-stroke-token': resolved.token },
        body: args,
      })
      return { status: response.status }
    } catch (error) {
      const failure = readFetchFailure(error)
      if (failure.status === 404) {
        // 見覚えのない 404 は `session_not_found` に寄せない（理由は写像の宣言に書いた）。
        const errorCode = ERROR_CODE_BY_404_MESSAGE[failure.message] ?? 'unexpected_status'
        return { status: 404, errorCode, error: failure.message }
      }
      const errorCode = ERROR_CODE_BY_STATUS[failure.status] ?? 'unexpected_status'
      return { status: failure.status, errorCode, error: failure.message }
    }
  },
})
