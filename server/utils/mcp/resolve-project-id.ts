import { upstreamClient } from '../control/upstream-proxy'
import { describeUpstreamFailure, type UpstreamCallFailure } from './upstream-failure'

export type ProjectIdResolution =
  | { ok: true, projectId: string }
  | ({ ok: false } & UpstreamCallFailure)

/**
 * projectPath から projectId を引き当てる（design.md「MCP の url は既存設定から組み立てる」）。
 *
 * 本家 `GET /api/projects/list` は起動中のプロジェクトしか返さない（ADR-0006）。一覧の取得
 * そのものに失敗する（未設定・接続不可）のは `unreachable`。一覧は取れたが対象が無いのは、
 * 本家に到達できて「無い」と分かった場合なので `upstream_error`（404）とし、`unreachable`
 * には混ぜない（design.md「相手が拒否した」と「相手に届かない」の区別）。
 */
export async function resolveProjectId(projectPath: string): Promise<ProjectIdResolution> {
  const result = await upstreamClient().listProjects()
  if (!result.ok) return { ok: false, ...describeUpstreamFailure(result.failure) }

  const entry = result.value.find(project => project.projectPath === projectPath)
  if (entry === undefined) {
    return {
      ok: false,
      status: 404,
      errorCode: 'upstream_error',
      error: '対象のプロジェクトが本家の一覧に無い。',
    }
  }

  return { ok: true, projectId: entry.projectId }
}
