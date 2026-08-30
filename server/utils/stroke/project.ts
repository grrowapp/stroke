import { access, rename } from 'node:fs/promises'
import { conflict } from './conflict'
import { sessionDir, projectDir } from './paths'

/** 昇格したプロジェクトの中の proposal の在り処。 */
export const PROJECT_DOCS_DIR = 'docs'
export const PROJECT_PROPOSAL_FILE = 'proposal.md'

/**
 * プロジェクト名として許す文字。保存先の外へ出られる形（`/` や先頭の `.`）を通さない。
 * 緩めれば保存先の外へ書けてしまうので、外から差し替えられないようにする。設定ではない
 * （docs/specs/core/settings-reference.md）。
 */
const PROJECT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * 承認されたセッションをプロジェクトへ昇格させる。
 *
 * **やるのは改名だけである**（openspec/specs/project/generation）。新しいディレクトリを
 * 作らず、ファイルを複製も移動もしない。セッションディレクトリの中身はすべてそのまま
 * プロジェクトの中身になる。`.spec-workflow/` の内部構造も作らない——それは承認後に
 * 起こす claude が呼ぶ本家 MCP の仕事である（ADR 0011）。
 *
 * セッションとプロジェクトは同じ親（`projectShareRoot`）の下にあるので、同じ親の下での
 * 改名で昇格が成立する。
 *
 * **衝突確認を改名の前に置く。** `rename` は相手が空ディレクトリだと黙って置き換えうる
 * ため、EEXIST 任せにしない（design.md D3）。
 *
 * 失敗は投げる。呼び出し側は phase を `proposed` のままにする責任を持つ。
 *
 * @returns 昇格後のプロジェクトのパス
 */
export async function promoteSessionToProject(
  shareRoot: string,
  sessionId: string,
  name: string,
): Promise<string> {
  const target = await assertNameAvailable(shareRoot, name)

  try {
    await rename(sessionDir(shareRoot, sessionId), target)
  } catch (error) {
    // 長すぎる名前など実行環境がディレクトリ名として受け付けない場合も、この経路を通る。
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: `プロジェクトへ昇格できなかった: ${messageOf(error)}`,
    })
  }

  return target
}

/**
 * 昇格を巻き戻す。改名を元へ戻すだけ。
 *
 * 承認は「衝突確認 → 改名 → `phase` を書く」の順で行う。`phase` の書き込みに失敗したとき、
 * **移動を1回戻せば元の状態に返る**。以前の順序（`phase` を書いてから改名）では、巻き戻しが
 * 「消えたかもしれない古い場所へ `phase` を書き戻す」になっていた。
 *
 * ここでは名前の形も衝突も見ない。戻す先は今しがた自分が空けた場所であり、確認する
 * ものが無いためである。失敗しても投げない——巻き戻しの失敗で元の失敗を覆い隠さない。
 */
export async function revertPromotion(
  shareRoot: string,
  name: string,
  sessionId: string,
): Promise<void> {
  await rename(projectDir(shareRoot, name), sessionDir(shareRoot, sessionId)).catch(() => {})
}

/**
 * その名前で昇格できるか。名前の形と、保存先での衝突を見る。
 *
 * **改名の前に通すためにここに切り出してある。** 承認は「衝突確認 → 改名 → `phase` を
 * 書く」の順で行い、既に同じ名前があるときは何も動かさずに 409 で返す。
 *
 * @returns 昇格先のパス
 */
export async function assertNameAvailable(shareRoot: string, name: string): Promise<string> {
  const target = projectDir(shareRoot, assertProjectName(name))
  if (await exists(target)) {
    throw conflict('name-conflict', `${target} は既に存在する。別の名前を確定すること。`)
  }
  return target
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * プロジェクト名として受け付けてよい形か。
 * kebab-case は AI が提案しユーザーが確定するもので、ここで矯正はしない。
 * 見るのは保存先の外へ出られる形になっていないかだけ。
 */
export function assertProjectName(name: string): string {
  const trimmed = name.trim()
  // 許す文字の規則も `..` を含む名前を弾く判定も設定にしない。どちらも緩めれば保存先の
  // 外へ書けてしまう（design.md 決定9）
  if (trimmed === '' || !PROJECT_NAME_PATTERN.test(trimmed) || trimmed.includes('..')) {
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
