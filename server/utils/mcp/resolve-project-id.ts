import { resolve, sep } from 'node:path'

import { upstreamClient } from '../control/upstream-proxy'
import type { ProjectListEntry } from '../upstream/schema'
import { describeUpstreamFailure, type UpstreamCallFailure } from './upstream-failure'

/**
 * 一覧は取れたが、その中に対象と一致・祖先関係にあるエントリが無い。
 *
 * **本家の応答ではなくここで組み立てた値である。** 代行に要る projectId が引けず、
 * 代行先へ要求を出せないので、保持すべき応答が存在しない。specs `mcp/server` が
 * 「代行先へ要求を出せなかった場合に限り」認めている2つのうちの1つで、`errorCode` を
 * 専用の値にして本家由来の `upstream_error` と混ざらないようにしてある
 * （santa-method レビュー指摘 2026-08-30）。
 *
 * `error` の本文には、引き当てに使ったパスと、そのとき一覧が持っていたプロジェクトの
 * 名前・パスを含める（design.md D4 / specs `mcp/server`）。一覧が空だった場合と、
 * 候補はあるが照合が外れた場合とで文言を変え、`error` だけで区別できるようにする。
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
 *
 * **一致だけでなく祖先も引き当てる（design.md D1）。** 本家は登録の前に渡されたパスを
 * 自分の規則（`git rev-parse --show-toplevel` 等）で解決してから登録するので、一覧の
 * `projectPath` はこちらが渡したパスそのものではなく、その祖先（作業ツリーの根）に
 * 化けていることがある。一覧の `projectPath` が要求パスと同じか祖先であるエントリを
 * 候補とし、最も深い（パス構成要素が最も多い）ものを採る——本家の解決は「そのパスを
 * 含む作業ツリーの根」を返すので、正しい候補は要求パス自身に一番近いものである。
 * 判定はパス構成要素の境界で行い、文字列の前方一致にはしない
 * （`/opt/projects/example` は `/opt/projects/example-2` の祖先ではない）。
 *
 * **`workflowRootPath` は見ない（design.md D2）。** `GET /api/projects/list` はそもそも
 * `workflowRootPath` を返さない。登録簿ファイルを直読みして手がかりにする案も、実物の
 * 登録（`workflowRootPath` が `SPEC_WORKFLOW_SHARED_ROOT` で決まり起動パスとの一致も
 * 祖先関係も保証されない）で不十分と分かっている。加えて登録簿ファイルを読むこと自体が
 * 「本家の状態は API を通してのみ触る」という upstream-connection の規定に反する。
 *
 * **本家のパス解決手続きは自分で再実行しない（design.md D1/D2）。** `git rev-parse
 * --show-toplevel` をこちらで走らせて照合する案は、本家の実装への依存を複製するだけで
 * 本家が解決規則を変えれば同じ形で壊れる。`deriveProjectId()` で projectId を導出して
 * 照合する案も、本家は解決後のパスから id を作るため、まさに直したい状況（解決でパスが
 * 変わる場面）では導出値が本家の id と一致せず効かない。
 */
export async function resolveProjectId(projectPath: string): Promise<ProjectIdResolution> {
  const result = await upstreamClient().listProjects()
  if (!result.ok) return { ok: false, ...describeUpstreamFailure(result.failure) }

  // 素の `===` では末尾スラッシュや `..` を含む形が一致しない。projectPath は
  // `GET /api/strokes/:id/invoke-agent` のクエリ `cwd` 由来で外から任意の書き方が
  // 渡るので、両側を正規化してから比べる。
  const wanted = normalizePath(projectPath)
  const entries = result.value

  const candidate = deepestAncestorOrSelf(entries, wanted)
  if (candidate === undefined) {
    return {
      ok: false,
      status: 404,
      errorCode: 'project_not_registered',
      error: buildNotRegisteredError(wanted, entries),
    }
  }

  return { ok: true, projectId: candidate.projectId }
}

/**
 * 一覧から、要求パスと同じか祖先であるエントリのうち最も深いものを選ぶ。
 *
 * 深さが同じ候補が複数残るのは、本家の一覧に同じパスが二重に載っている場合だけである。
 * そのときは従来どおり一覧の先頭側を採る（`.find` と同じ）——ここで新しい失敗を作らない。
 * `for` ループで先着優先（`depth > bestDepth` のときだけ入れ替える）を保つのはそのため。
 */
function deepestAncestorOrSelf(entries: readonly ProjectListEntry[], wanted: string): ProjectListEntry | undefined {
  let best: ProjectListEntry | undefined
  let bestDepth = -1

  for (const entry of entries) {
    const entryPath = normalizePath(entry.projectPath)
    if (!isSameOrAncestor(entryPath, wanted)) continue

    const depth = pathDepth(entryPath)
    if (depth > bestDepth) {
      best = entry
      bestDepth = depth
    }
  }

  return best
}

/**
 * `candidatePath` が `targetPath` と同じか、その祖先であるかを判定する。
 *
 * パス構成要素の境界でのみ祖先と扱う——`startsWith` に区切り文字を挟んで比較することで、
 * `/opt/projects/example` が `/opt/projects/example-2` を拾う（文字列としての前方一致）
 * ことを避ける。
 */
function isSameOrAncestor(candidatePath: string, targetPath: string): boolean {
  if (candidatePath === targetPath) return true
  const prefix = candidatePath.endsWith(sep) ? candidatePath : `${candidatePath}${sep}`
  return targetPath.startsWith(prefix)
}

/** 正規化済みパスの構成要素数。ルート（`/`）は 0。 */
function pathDepth(normalizedPath: string): number {
  return normalizedPath.split(sep).filter(segment => segment.length > 0).length
}

/**
 * `project_not_registered` の `error` 本文を組み立てる（design.md D4）。
 *
 * 一覧が空だった場合と、候補はあるが照合が外れた場合とで文言を変える——
 * どちらも「登録されていない」としか読めない本文にしない（specs `mcp/server` MUST NOT）。
 * 引き当てに使ったパスと、一覧が持っていたプロジェクトの名前・パスを両方の場合に含める。
 */
function buildNotRegisteredError(wanted: string, entries: readonly ProjectListEntry[]): string {
  if (entries.length === 0) {
    return `本家の一覧が空で、対象のプロジェクト（要求パス: ${wanted}）を含んでいない。`
  }

  const known = entries.map(entry => `${entry.projectName} (${entry.projectPath})`).join(', ')
  return `対象のプロジェクト（要求パス: ${wanted}）が本家の一覧の中で一致・祖先のいずれにも当たらない。一覧にあるのは: ${known}`
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
