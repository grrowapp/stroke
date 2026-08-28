import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import { resolveConnection } from '../../utils/mcp/connection-table'
import { readFetchFailure } from '../../utils/mcp/fetch-failure'
import { requireConnectionProjectPath, requireConnectionSessionId } from '../../utils/mcp/require-connection'
import { resolveProjectId } from '../../utils/mcp/resolve-project-id'
import { classifySteeringFailure, upstreamFetch } from '../../utils/mcp/upstream-fetch'

const FLONTIER_ERROR_CODE_BY_STATUS: Record<number, string> = {
  400: 'validation_error',
  404: 'session_not_found',
  409: 'phase_conflict',
}

/**
 * 種別で A7（flontier）/ 本家 PUT（steering）へ振り分ける。specs `mcp/tools/submit`。
 *
 * flontier 側の `status` は `send-question.ts` と同じ理由で実際の応答をそのまま持つ
 * （`docs/specs/api/api-contract.md` は 204 だが、現在の実装
 * `server/api/strokes/[id]/proposal.post.ts` は 200 を返す）。
 */
export default defineStrokeTool({
  description: '文書を提出する（type: flontier は proposal、steering は指定した文書名の steering 文書）',
  // 上限・許容値は**説明として**書く（`.max()` や `.enum()` で弾かない）。検証の正は
  // 代行先（A7 / 本家 PUT）に置いたままにする——ADR-0014。send-question と同じ理由で、
  // 契約に書かないとエージェントは形を探り続けることになる。
  inputSchema: {
    type: z.enum(['flontier', 'steering']),
    document: z.string().describe('文書の本文そのもの。ファイルパスではない'),
    name: z.string().optional().describe('type が steering のときの文書名。product / tech / structure のいずれか'),
  },
  outputSchema: {
    status: z.number(),
    errorCode: z.string().optional(),
    error: z.string().optional(),
  },
  handler: async (args, extra) => {
    const conn = resolveConnection(extra.requestInfo?.headers ?? {})

    if (args.type === 'flontier') {
      const sessionId = requireConnectionSessionId(conn)

      try {
        const response = await $fetch.raw(`/api/strokes/${encodeURIComponent(sessionId)}/proposal`, {
          method: 'POST',
          body: { proposal: args.document },
        })
        return { status: response.status }
      } catch (error) {
        const failure = readFetchFailure(error)
        const errorCode = FLONTIER_ERROR_CODE_BY_STATUS[failure.status] ?? 'unexpected_status'
        return { status: failure.status, errorCode, error: failure.message }
      }
    }

    // `name` はツール自身の引数契約（specs `mcp/tools/submit`「steering の場合は文書名を
    // 併せて取る SHALL」）が要求するもので、文書名の値（product/tech/structure か）の
    // 検証ではない。欠けたまま本家へ発行すると URL のパスセグメントが空になり、本家の
    // fastify ルートにすらマッチせず素の 404 になってしまう（santa-method レビュー指摘）。
    // 「引数契約を満たすか」はツール自身の責務不成立の判定であり ADR-0014 の対象外。
    if (args.name === undefined || args.name === '') {
      return { status: 400, errorCode: 'validation_error', error: '文書名（name）が無い。' }
    }

    const projectPath = requireConnectionProjectPath(conn)
    const resolved = await resolveProjectId(projectPath)
    if (!resolved.ok) {
      return { status: resolved.status, errorCode: resolved.errorCode, error: resolved.error }
    }

    try {
      await upstreamFetch(
        `/api/projects/${encodeURIComponent(resolved.projectId)}/steering/${encodeURIComponent(args.name)}`,
        { method: 'PUT', body: { content: args.document } },
      )
      return { status: 200 }
    } catch (error) {
      const failure = classifySteeringFailure(error)
      return { status: failure.status, errorCode: failure.errorCode, error: failure.error }
    }
  },
})
