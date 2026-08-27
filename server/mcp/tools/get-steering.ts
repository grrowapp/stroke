import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import { upstreamClient } from '../../utils/control/upstream-proxy'
import { resolveConnection } from '../../utils/mcp/connection-table'
import { requireConnectionProjectPath } from '../../utils/mcp/require-connection'
import { resolveProjectId } from '../../utils/mcp/resolve-project-id'
import { describeUpstreamFailure } from '../../utils/mcp/upstream-failure'
import { classifySteeringFailure, upstreamFetch } from '../../utils/mcp/upstream-fetch'
import type { SteeringDocument } from '../../utils/upstream/rest'

/**
 * 本家 `GET /api/projects/:projectId/steering/:name` と `GET /api/projects/:projectId/info`
 * への代行。specs `mcp/tools/steering`。
 *
 * `name` は本家側で検証させる（規定外の名前は本家が 400 で拒否し、その本文をそのまま
 * `error` に渡す）。ツール側で候補を絞らない（design.md「本家の応答をツール側で変換しては
 * ならない」）。
 */
export default defineStrokeTool({
  description: 'steering 文書（product / tech / structure）を取得する',
  // 許容値は説明として書き、`.enum()` で弾かない（ADR-0013。規定外の名前は代行先が
  // 400 `validation_error` で返す）。
  inputSchema: {
    name: z.string().describe('文書名。product / tech / structure のいずれか'),
  },
  outputSchema: {
    status: z.number(),
    exists: z.boolean().optional(),
    content: z.string().optional(),
    errorCode: z.string().optional(),
    error: z.string().optional(),
  },
  handler: async (args, extra) => {
    const projectPath = requireConnectionProjectPath(resolveConnection(extra.requestInfo?.headers ?? {}))

    const resolved = await resolveProjectId(projectPath)
    if (!resolved.ok) {
      return { status: resolved.status, errorCode: resolved.errorCode, error: resolved.error }
    }

    try {
      const [document, info] = await Promise.all([
        upstreamFetch<{ content: string }>(
          `/api/projects/${encodeURIComponent(resolved.projectId)}/steering/${encodeURIComponent(args.name)}`,
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
      return { status: 200, exists, content: document.content }
    } catch (error) {
      const failure = classifySteeringFailure(error)
      return { status: failure.status, errorCode: failure.errorCode, error: failure.error }
    }
  },
})
