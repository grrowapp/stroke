import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import { upstreamClient } from '../../utils/control/upstream-proxy'
import { resolveConnection } from '../../utils/mcp/connection-table'
import { resolveConnectionProjectPath } from '../../utils/mcp/require-connection'
import { resolveProjectId } from '../../utils/mcp/resolve-project-id'
import { describeUpstreamFailure } from '../../utils/mcp/upstream-failure'
import { classifySteeringFailure, upstreamFetch } from '../../utils/mcp/upstream-fetch'
import type { SteeringDocument } from '../../utils/upstream/rest'
import { documentContentSchema } from '../../utils/upstream/schema'

/**
 * 本家 `GET /api/projects/:projectId/steering/:name` と `GET /api/projects/:projectId/info`
 * への代行。specs `mcp/tools/steering`。
 *
 * `name` は本家側で検証させる（規定外の名前は本家が 400 で拒否し、その本文をそのまま
 * `error` に渡す）。ツール側で候補を絞らない（design.md「本家の応答をツール側で変換しては
 * ならない」）。例外は本家のルートに届かない形だけで、これは手前で弾く
 * （理由は `isRoutableDocumentName`）。
 */

/**
 * 本家の `:name` ルートへ届く文書名か。
 *
 * 空文字・`.`・`..` は `encodeURIComponent` を通してもそのまま残り、URL の正規化で
 * パスセグメントが消える（実測 2026-08-30: `..` は `GET /api/projects/PID1/`、`.` は
 * `GET /api/projects/PID1/steering/` を発行する。`/` を含む `a/b` は `%2F` になるので
 * 無害）。本家の fastify ルート（`:name`）にすらマッチせず素の 404 が返るので、規定外の
 * 文書名なのに `validation_error` にならない（specs `mcp/tools/steering` の「規定外の
 * 文書名 → status: 400・validation_error」に反する。santa-method レビュー指摘 4周目
 * 2026-08-30）。
 *
 * `name` が欠けている場合（`inputSchema` が optional なので届きうる）も同じ結果に畳む。
 * 代行先の URL に埋まる項目なので、欠けていると要求そのものを組み立てられない。
 *
 * 弾くのは**本家のルートに届かない形だけ**で、値そのものの検証（product/tech/structure
 * か）は本家に任せたまま——ADR-0014。
 *
 * `submit-document.ts` に同じ判定・同じ文言を置いてある。共通の置き場は
 * `server/utils/mcp/` になるが、この change では触らないので各ファイルに写してある。
 */
function isRoutableDocumentName(name: string | undefined): name is string {
  return name !== undefined && !['', '.', '..'].includes(name)
}

/** 本家のルートに届かない文書名を弾いたときの文言。`submit-document.ts` と揃える */
const UNROUTABLE_NAME_ERROR = '文書名（name）が無いか、使えない形（. / ..）。'
export default defineStrokeTool({
  description: 'steering 文書（product / tech / structure）を取得する',
  // 許容値は説明として書き、`.enum()` で弾かない（ADR-0014。規定外の名前は代行先が
  // 400 `validation_error` で返す）。
  //
  // **必須にもしない（`.optional()`）。** MCP SDK は `inputSchema` をハンドラより**前**に
  // 検証し、通らなければ `McpError(InvalidParams)` を投げる
  // （`@modelcontextprotocol/sdk/dist/esm/server/mcp.js` の `validateToolInput` が
  // 174-178 行で `safeParseAsync` の失敗を投げ、その呼び出しは 125 行——ハンドラを呼ぶ
  // 126 行より前）。モジュールの try/catch はハンドラの内側しか覆わない
  // （`@nuxtjs/mcp-toolkit/dist/runtime/server/mcp/definitions/tools.js` 36-44 行）ため、
  // 必須にすると `name` を欠いた呼び出しが `status` も `errorCode` も持たない結果になり、
  // specs `mcp/server` の平坦形式の SHALL（無条件）を破る。併せて、下の
  // `isRoutableDocumentName` の `name !== undefined` が到達不能な死んだコードになって
  // いた（santa-method レビュー指摘 5周目 2026-08-30）。
  //
  // `name` は代行先の URL に埋まる＝要求そのものを組み立てられない項目なので、欠落は
  // ハンドラの中で平坦な 400 `validation_error` にする（`submit-document.ts` と同じ）。
  inputSchema: {
    name: z.string().optional().describe('文書名。product / tech / structure のいずれか。省くと 400 になる'),
  },
  outputSchema: {
    status: z.number(),
    exists: z.boolean().optional(),
    content: z.string().optional(),
    errorCode: z.string().optional(),
    error: z.string().optional(),
  },
  handler: async (args, extra) => {
    // throw ではなく結果で返す。工程ごとの公開ツールの絞り（`x-mcp-tools`）は fail-open で、
    // ヘッダが届かなければ絞られない。絞りが外れた側で throw すると `status` も `errorCode`
    // も持たない `isError` テキストになり、`mcp/server` の平坦形式の SHALL（無条件）を破る
    // （santa-method レビュー指摘 3周目 2026-08-30）。
    //
    // token の欠落・不一致も同じ理由で平坦なエラーにする（`connection-table.ts`）。
    const connection = resolveConnection(extra.requestInfo?.headers ?? {})
    if (!connection.ok) {
      return { status: connection.status, errorCode: connection.errorCode, error: connection.error }
    }

    const connected = resolveConnectionProjectPath(connection.context)
    if (!connected.ok) {
      return { status: connected.status, errorCode: connected.errorCode, error: connected.error }
    }
    const projectPath = connected.projectPath

    // 本家のルートに届かない形はここで弾く（理由は `isRoutableDocumentName`）。
    if (!isRoutableDocumentName(args.name)) {
      return { status: 400, errorCode: 'validation_error', error: UNROUTABLE_NAME_ERROR }
    }

    // 代行先を呼ぶものはすべて try の中に置く。`resolveProjectId` は現状 throw しないが、
    // 外に出すとそこだけ平坦形の保証が及ばない（santa-method レビュー指摘 6周目 2026-08-30）
    try {
      const resolved = await resolveProjectId(projectPath)
      if (!resolved.ok) {
        return { status: resolved.status, errorCode: resolved.errorCode, error: resolved.error }
      }

      const [document, info] = await Promise.all([
        // 本家の応答は `{ content, lastModified }`（`multi-server.ts` の
        // `GET /api/projects/:projectId/steering/:name`）。使うのは `content` だけなので
        // `documentContentSchema` で受ける。形が違えば `upstream_malformed` になり、
        // 「文書がまだ無い（空の本文）」と取り違えない。
        upstreamFetch(
          `/api/projects/${encodeURIComponent(resolved.projectId)}/steering/${encodeURIComponent(args.name)}`,
          documentContentSchema,
        ),
        upstreamClient().getProjectInfo(resolved.projectId),
      ])

      if (!info.ok) {
        const failure = describeUpstreamFailure(info.failure)
        return { status: failure.status, errorCode: failure.errorCode, error: failure.error }
      }

      // args.name がここまで到達しているのは、上の upstreamFetch が本家の検証（400）を
      // 通過した時だけ = 規定の3値のいずれかであることが保証されている。
      const exists = info.value.steering.documents[args.name as SteeringDocument]
      // `status` は本家の実応答（`mcp/server`「代行先が応答を返したなら、その status を
      // 保持する」SHALL）。定数を置かない。
      return { status: document.status, exists, content: document.data.content }
    } catch (error) {
      const failure = classifySteeringFailure(error)
      return { status: failure.status, errorCode: failure.errorCode, error: failure.error }
    }
  },
})
