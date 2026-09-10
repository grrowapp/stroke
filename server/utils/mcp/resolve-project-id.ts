import { resolve } from 'node:path'

import { upstreamClient } from '../control/upstream-proxy'
import type { ProjectListEntry } from '../upstream/schema'
import { describeUpstreamFailure, type UpstreamCallFailure } from './upstream-failure'

/**
 * 一覧は取れたが、その中に対象が無い。
 *
 * **本家の応答ではなくここで組み立てた値である。** 代行に要る projectId が引けず、
 * 代行先へ要求を出せないので、保持すべき応答が存在しない。specs `mcp/server` が
 * 「代行先の応答から結果を組み立てられなかった場合に限り」ツールに組み立てを認めている
 * 5つのうちの1つで、そのうち**代行先の応答がそもそも存在しない4つ**に入る。`errorCode` を
 * 専用の値にして本家由来の `upstream_error` と混ざらないようにしてある
 * （santa-method レビュー指摘 2026-08-30）。
 *
 * `error` の本文には、引き当てに使ったパスと、そのとき一覧が持っていたプロジェクトの
 * 名前・パスを含める（design.md D4 / specs `mcp/server`）。一覧が空だった場合と、
 * 一覧にプロジェクトはあるが対応しない場合とで文言を変え、`error` だけで区別できる
 * ようにする。
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
 * projectPath から projectId を引き当てる
 * （openspec/specs/upstream-connection「パスから本家の projectId を引き当てる」）。
 *
 * 本家 `GET /api/projects/list` は起動中のプロジェクトしか返さない（ADR-0006）。一覧の取得
 * そのものに失敗する（未設定・接続不可）のは `unreachable`。一覧は取れたが対象が無いのは
 * 本家の応答ではないので、`project_not_registered` として本家由来の失敗と区別する。
 *
 * **照合は一覧の `projectPath` との完全一致で行う（design.md D1）。** 本家は登録の前に
 * 渡されたパスを `git rev-parse --show-toplevel` で解決するので、共有ルートが git 管理下に
 * あれば一覧の値は渡した cwd と違うものになる。そのときは引き当てを外し、
 * `project_not_registered` で止める——解決の差をこちら側で吸収してはならない。差が出る場面は
 * 本家自身が複数のセッションを1つの `projectId` にまとめている場面であり、吸収して引き当てると
 * 別プロジェクトと共有の id を返して steering 文書を静かに取り違える。
 *
 * **共有ルートは git 管理下に置かない**（`docs/specs/reference/upstream-observations.md`
 * 「登録されるパスは git のトップレベルへ解決される」）。この前提が崩れる場面は本家自身が
 * セッションを区別できないので、引き当て側では直せない。
 *
 * **`workflowRootPath` は見ない（design.md D2）。** `GET /api/projects/list` はそもそも
 * `workflowRootPath` を返さない。登録簿ファイルを直読みして手がかりにする案も、実物の
 * 登録（`workflowRootPath` は `SPEC_WORKFLOW_SHARED_ROOT` か `resolveGitRoot` で決まり、
 * 起動 cwd との対応が保証されない）で不十分と分かっている。加えて、ここは MCP ツールの
 * 代行経路なので `mcp/server`「ハンドラは対応する endpoint へ要求を発行してその応答だけから
 * 結果を作る」に従う——**引き当てのために**登録簿を読まない。登録簿の読み取りそのものは
 * 禁じられていない（`server/utils/upstream/registry.ts` がアクティブ判定に使う。ADR-0006
 * 「アクティブ判定だけを `activeProjects.json` / 本家 API で重ねる」）。
 *
 * **本家のパス解決手続きは自分で再実行しない（design.md D2）。** `git rev-parse
 * --show-toplevel` をこちらで走らせて照合する案は、本家の実装への依存を複製するだけで
 * 本家が解決規則を変えれば同じ形で壊れる。`deriveProjectId()` で projectId を導出して
 * 照合する案も、本家は解決後のパスから id を作るため、解決でパスが変わる場面では導出値が
 * 本家の id と一致せず効かない。
 */
export async function resolveProjectId(projectPath: string): Promise<ProjectIdResolution> {
  const result = await upstreamClient().listProjects()
  if (!result.ok) return { ok: false, ...describeUpstreamFailure(result.failure) }

  // 素の `===` では末尾スラッシュや `..` を含む形が一致しない。projectPath は
  // `GET /api/sessions/:id/invoke-agent` のクエリ `cwd` 由来で外から任意の書き方が
  // 渡るので、両側を正規化してから比べる。
  const wanted = normalizePath(projectPath)
  const entries = result.value

  const entry = entries.find(candidate => normalizePath(candidate.projectPath) === wanted)
  if (entry === undefined) {
    return {
      ok: false,
      status: 404,
      errorCode: 'project_not_registered',
      error: buildNotRegisteredError(wanted, entries),
    }
  }

  return { ok: true, projectId: entry.projectId }
}

/**
 * `project_not_registered` の `error` 本文を組み立てる（design.md D4）。
 *
 * 一覧が空だった場合と、一覧にプロジェクトはあるが対応しない場合とで文言を変える——
 * どちらも「登録されていない」としか読めない本文にしない（specs `mcp/server` MUST NOT）。
 * 引き当てに使ったパスと、一覧が持っていたプロジェクトの名前・パスを両方の場合に含める。
 */
function buildNotRegisteredError(wanted: string, entries: readonly ProjectListEntry[]): string {
  if (entries.length === 0) {
    return `本家の一覧が空で、対象のプロジェクト（要求パス: ${wanted}）を含んでいない。`
  }

  const known = entries.map(entry => `${entry.projectName} (${entry.projectPath})`).join(', ')
  return `対象のプロジェクト（要求パス: ${wanted}）が本家の一覧のどれとも一致しない。一覧にあるのは: ${known}`
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
