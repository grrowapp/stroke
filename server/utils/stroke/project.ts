import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { conflict } from './conflict'
import { PROJECTS_ROOT, projectDir } from './paths'

/**
 * 承認されたプロジェクトを作る。
 *
 * 作るのはトップのディレクトリと `docs/proposal.md` だけ。`.spec-workflow/` の内部構造は
 * 作らない（後に spec-workflow がプロジェクトルートとして受け取る）。
 *
 * 生成先が既にあれば何も書かずに 409。途中で失敗したら、このリクエストで作った分を
 * 取り消して 500。長すぎる名前など実行環境がディレクトリ名として受け付けない場合も、
 * この汎用の 500 経路を通る。どちらの場合も呼び出し側は phase を `proposed` のままにする。
 *
 * @returns 作られたプロジェクトのパス
 */
export async function generateProject(name: string, proposal: string): Promise<string> {
  const root = projectDir(assertProjectName(name))

  // recursive を付けないので、既にあれば EEXIST で落ちる。存在確認と作成が同時に済み、
  // 「既にある場合は何も書き込まない」が確実になる。
  try {
    await mkdir(root)
  } catch (error) {
    if (isErrnoCode(error, 'EEXIST')) {
      throw conflict('name-conflict', `${root} は既に存在する。別の名前を確定すること。`)
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: `プロジェクトのディレクトリを作れなかった: ${messageOf(error)}`,
    })
  }

  try {
    await mkdir(join(root, 'docs'))
    await writeFile(join(root, 'docs', 'proposal.md'), proposal, 'utf8')
  } catch (error) {
    // 中途半端に残すと同じ名前で承認し直せなくなるので、作った分だけ戻す。
    await rm(root, { recursive: true, force: true }).catch(() => {})
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: `proposal を書き出せなかった: ${messageOf(error)}`,
    })
  }

  return root
}

/**
 * 候補を `/opt/projects/` の既存名と突合し、衝突しない名前を返す。
 * 衝突していれば `-2`, `-3`, … の連番サフィックスで最初に空く名前にする。
 */
export async function resolveAvailableProjectName(candidate: string): Promise<string> {
  const existing = new Set(await readdir(PROJECTS_ROOT))
  if (!existing.has(candidate)) return candidate

  for (let n = 2; ; n++) {
    const name = `${candidate}-${n}`
    if (!existing.has(name)) return name
  }
}

/**
 * プロジェクト名として受け付けてよい形か。
 * kebab-case は AI が提案しユーザーが確定するもので、ここで矯正はしない。
 * 見るのは `/opt/projects/` の外へ出られる形になっていないかだけ。
 */
export function assertProjectName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed) || trimmed.includes('..')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'プロジェクト名に使えない文字が含まれている。',
    })
  }
  return trimmed
}

/** kebab-case かどうか。A7 の `projectName` を候補として採るかどうかの判定に使う。 */
export function isKebabCase(value: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)
}

function isErrnoCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === code
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
