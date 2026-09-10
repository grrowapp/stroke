import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { ProjectDirectory } from '#shared/types'
import type { ServerConfig } from '../utils/config'
import { listPromotedProjects } from '../utils/control/creating'
import { buildProjectDirectory } from '../utils/control/directory'
import { upstreamClient } from '../utils/control/upstream-proxy'
import { isSafeSegment } from '../utils/stroke/paths'
import { deriveProjectId } from '../utils/upstream/project-id'
import { readRegistry, type RegistryEntry } from '../utils/upstream/registry'
import { UpstreamRestClient, type UpstreamResult } from '../utils/upstream/rest'
import { scanProjects } from '../utils/upstream/scan'
import type { ProjectInfo, ProjectRegistration } from '../utils/upstream/schema'

/**
 * プロジェクトの所在を扱う実処理。
 *
 * ここが持つのは4つ——上層へ返す一覧の組み立て、`projectId` から保存先の名前を引く走査、
 * 本家が持つ1件の情報の取得、本家への登録。どれも「どのプロジェクトがどこに在るか」を
 * 相手（保存先・本家）に問うものである。
 *
 * **局面（phase）の述語は持たない。** 受理してよい局面かの判定は endpoint が持つ
 * （`docs/specs/api/projects/delete.md`）。
 *
 * 一覧だけが設定を引数で受けるのは、走査の親パスと本家のグローバル状態の置き場という
 * 「本家の URL 以外の設定」を要るためである。1操作を渡すだけのものは、サーバの他の場所
 * （`server/utils/stroke/invoke.ts`）と同じく `upstreamClient()` をそのまま呼ぶ。
 */

/** 一覧の組み立てが要る設定。`readServerConfig()` の一部を endpoint から受け取る */
export type ProjectDirectoryConfig = Pick<
  ServerConfig,
  'projectsParentPath' | 'specWorkflowHome' | 'upstreamBaseUrl'
>

/**
 * 上層のプロジェクト一覧を組み立てる。
 *
 * 走査も本家への問い合わせも、画面が要求したときに行う。定期実行しない
 * （tech.md の Performance Requirements）。
 *
 * 昇格の記録は走査と同じ保存先を読む。承認した直後のプロジェクトは走査に出てこないので、
 * これが無いと一覧に現れない（specs/project/directory）。
 */
export async function listProjectDirectory(config: ProjectDirectoryConfig): Promise<ProjectDirectory> {
  const [scan, registry, promoted] = await Promise.all([
    scanProjects(config.projectsParentPath),
    readRegistry(config.specWorkflowHome),
    listPromotedProjects(config.projectsParentPath),
  ])

  const entries = registry.status === 'ok' ? registry.entries : []

  return buildProjectDirectory(
    scan,
    { entries, readable: registry.status === 'ok' },
    await countPendingApprovals(config.upstreamBaseUrl, entries),
    promoted,
  )
}

/**
 * `projectId` から保存先直下の名前を引く。
 *
 * ハッシュは戻せないので、直下を走査して**導出値が一致するもの**を探す。件数は保存先の
 * 直下の数だけで、走査そのものは一覧の組み立てでも毎回行っている規模である。
 *
 * **向きは `server/utils/mcp/resolve-project-id.ts` の逆である。** あちらは名前（パス）から
 * 本家の一覧を引いて id を得る。こちらは id から保存先の名前を得る。
 */
export async function resolveProjectName(root: string | null, projectId: string): Promise<string | null> {
  if (root === null) return null

  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return null
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeSegment(entry.name)) continue
    if (deriveProjectId(join(root, entry.name)) === projectId) return entry.name
  }

  return null
}

/** 本家が持つ1件の情報（`GET /api/projects/:projectId/info`）を取る。 */
export function readProjectInfo(projectId: string): Promise<UpstreamResult<ProjectInfo>> {
  return upstreamClient().getProjectInfo(projectId)
}

/**
 * 昇格したプロジェクトの生成を本家へ依頼する（`POST /api/projects/add`）。
 *
 * 受け取ったパスをそのまま送る。パスの形の検証は endpoint が持つ——親の直下1階層かどうかは
 * 保存先の設定を知っている側にしか決められない。
 */
export function registerProject(projectPath: string): Promise<UpstreamResult<ProjectRegistration>> {
  return upstreamClient().registerProject(projectPath)
}

/**
 * 保留中の承認依頼の件数を、アクティブなプロジェクトぶんだけ数える。
 *
 * 通知（＝接続後に起きた変化）とは別物である。通知は接続直後には1件も無いが、承認待ちは
 * その時点で既に起きている。見に行かずに気づくのがこのプロダクトの目的なので、今の状態も
 * 出す（product.md の Purpose）。
 *
 * 本家が返す配列を数えているだけで、意味づけを足していない（docs/adr/0005）。
 * 取れなかったプロジェクトは持たない。0件と混ぜない。
 */
async function countPendingApprovals(
  upstreamBaseUrl: string | null,
  entries: RegistryEntry[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (upstreamBaseUrl === null) return counts

  const client = new UpstreamRestClient(upstreamBaseUrl)
  const active = entries.filter((entry) => entry.instances.length > 0)

  await Promise.all(
    active.map(async (entry) => {
      const result = await client.listPendingApprovals(entry.projectId)
      if (result.ok) counts.set(entry.projectId, result.value.length)
    }),
  )

  return counts
}
