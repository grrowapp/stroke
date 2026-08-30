import { resolve } from 'node:path'

import { upstreamClient } from '../control/upstream-proxy'
import { describeUpstreamFailure, type UpstreamCallFailure } from './upstream-failure'

/**
 * 一覧は取れたが、その中に対象が無い。
 *
 * **本家の応答ではなくここで組み立てた値である。** 代行に要る projectId が引けず、
 * 代行先へ要求を出せないので、保持すべき応答が存在しない。specs `mcp/server` が
 * 「代行先へ要求を出せなかった場合に限り」認めている2つのうちの1つで、`errorCode` を
 * 専用の値にして本家由来の `upstream_error` と混ざらないようにしてある
 * （santa-method レビュー指摘 2026-08-30）。
 */
export interface ProjectNotRegisteredFailure {
  status: 404
  errorCode: 'project_not_registered'
  error: string
}

export type ProjectIdResolution =
  | { ok: true, projectId: string }
  | ({ ok: false } & (UpstreamCallFailure | ProjectNotRegisteredFailure))

/**
 * projectPath から projectId を引き当てる（design.md「MCP の url は既存設定から組み立てる」）。
 *
 * 本家 `GET /api/projects/list` は起動中のプロジェクトしか返さない（ADR-0006）。一覧の取得
 * そのものに失敗する（未設定・接続不可）のは `unreachable`。一覧は取れたが対象が無いのは
 * 本家の応答ではないので、`project_not_registered` として本家由来の失敗と区別する。
 */
export async function resolveProjectId(projectPath: string): Promise<ProjectIdResolution> {
  const result = await upstreamClient().listProjects()
  if (!result.ok) return { ok: false, ...describeUpstreamFailure(result.failure) }

  // 素の `===` では末尾スラッシュや `..` を含む形が一致しない。projectPath は
  // `GET /api/strokes/:id/invoke-agent` のクエリ `cwd` 由来で外から任意の書き方が
  // 渡るので、両側を正規化してから比べる。
  const wanted = normalizePath(projectPath)
  const matched = result.value.filter(project => normalizePath(project.projectPath) === wanted)

  // 正規化して複数一致するのは、本家の一覧に同じパスが二重に載っている場合だけ。
  // ここで新しい status を作ると本家が返していない応答の捏造になるので、従来どおり
  // 先頭を採る（`.find` と同じ）。二重登録は本家側で直すべきものである。
  const entry = matched[0]
  if (entry === undefined) {
    return {
      ok: false,
      status: 404,
      errorCode: 'project_not_registered',
      error: '対象のプロジェクトが本家の一覧に無い。',
    }
  }

  return { ok: true, projectId: entry.projectId }
}

/**
 * 比較用にパスを正規化する。`..` と `.` を畳み、末尾スラッシュを落とす。
 *
 * `resolve` を使うのは、相対パスが渡ったときにプロセスの cwd を基準に絶対パスへ
 * 揃えるため（`server/utils/readiness.ts` が絶対パスを前提に置いているのと同じ考え）。
 */
function normalizePath(path: string): string {
  return resolve(path)
}
