import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import fse from 'fs-extra'
import type { Invocation, SessionSummary } from '#shared/stroke'
import { OPENSPEC_CONFIG_FILE, OPENSPEC_DIR } from './openspec'
import { sessionDir, sessionFile } from './paths'

/**
 * セッションの作成・削除・列挙の実体。endpoint（Nitro）と script（tsx）の両方から
 * 同じこの実装を呼ぶ（design.md 決定3: 同じ規定を2つ実装しない）。
 *
 * Nitro に依存しない: `useRuntimeConfig` は呼ばず必要な値は引数で受け、失敗は
 * `createError` ではなく種別を持つ `SessionCoreError` で表す。HTTP のステータスへの
 * 写しは endpoint 側、終了コードへの写しは script 側の責務。
 *
 * 保存先（`root` = `projectShareRoot`）も設定から引かず第1引数で受け取る。解決するのは
 * 端だけで、endpoint 側は `session-store.ts`、CLI 側は `scripts/session.ts` が渡す
 * （docs/specs/core/settings-reference.md「設定を引くのは端だけである」）。
 */

export type SessionCoreErrorKind = 'not-found' | 'io' | 'phase'

export class SessionCoreError extends Error {
  constructor(
    public readonly kind: SessionCoreErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'SessionCoreError'
  }
}

/**
 * セッションディレクトリ内のファイル名。中身の書式とセットで決まるものなので、
 * 名前だけを外から差し替えられる意味がない。設定ではない
 * （docs/specs/core/settings-reference.md）。
 */
export const SESSION_FILES = {
  state: 'state.json',
  strokes: 'strokes.json',
  overview: 'overview.txt',
  sendBack: 'send-back.json',
} as const

/** uuid の形をしているか。セッション（昇格前）の id はこの形である。 */
export function isSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
}

/**
 * 保存先の直下の1つとして、ディレクトリ名にそのまま使える形か。
 *
 * 対象の id は昇格でプロジェクト名に変わるので、uuid の形では絞れない。代わりに
 * **保存先の外へ出られる形を通さない**ことだけを見る。`project.ts` の
 * `assertProjectName` と同じ線引きで、緩めれば保存先の外を読み書きできてしまう。
 */
export function isSafeSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes('..')
}

/** 対象として成立しているか。`state.json` が在ることをもって在るとする。 */
export async function sessionExistsCore(root: string, sessionId: string): Promise<boolean> {
  if (!isSafeSegment(sessionId)) return false
  try {
    const s = await stat(sessionFile(root, sessionId, SESSION_FILES.state))
    return s.isFile()
  } catch {
    return false
  }
}

/**
 * セッションを作る。ディレクトリ作成 → 概要・strokes・state の書き込み。
 * openspec ルートの初期化（実行環境の準備）はここではやらない。invokeAi が初回の
 * 起動時に自分で行う（ユーザー決定）。だから作成直後のセッションは一覧の検査
 * （openspec・config.yaml）を通らず、初回判定が「初回」になる。
 * 途中で失敗したら作りかけのディレクトリごと消して失敗を返す
 * （半端なセッションを残さない・design.md 決定1）。
 */
export async function createSessionCore(
  root: string,
  overview: string,
  invocation: Invocation,
): Promise<string> {
  const sessionId = randomUUID()
  try {
    await mkdir(sessionDir(root, sessionId), { recursive: true })
    await writeAtomic(root, sessionId, SESSION_FILES.overview, overview)
    await writeAtomic(root, sessionId, SESSION_FILES.strokes, `${JSON.stringify([], null, 2)}\n`)
    const state = { phase: 'stroking', currentQuestion: null, invocation }
    await writeAtomic(root, sessionId, SESSION_FILES.state, `${JSON.stringify(state, null, 2)}\n`)
    return sessionId
  } catch (error) {
    await fse.remove(sessionDir(root, sessionId)).catch(() => {})
    throw new SessionCoreError(
      'io',
      `セッションを作れなかった: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * セッションを消す。存在検査 → `fs-extra` の `remove(sessionDir)`（design.md 決定4）。
 * 存在しない id は何も消さず失敗にする（`remove` は存在しないパスで沈黙するため、検査を
 * 先に置くことで「無いものを消した」ことにしない）。
 *
 * **phase の検査は持たない。** どの局面のものを消してよいかは、削除の口（endpoint）が
 * それぞれ決める——セッションの削除は承認より前、プロジェクトの削除は承認以降。判定を
 * ここに置くと、実行が「誰から呼ばれたか」を知ることになる。
 *
 * **この関数は CLI（`yarn session delete`）の素通しの口である。** endpoint は
 * `server/handler/delete.ts` を通し、その手前で phase を見る。CLI に同じ守りは無い——
 * 名前を直に渡せば昇格済みのプロジェクトも消える。手元の道具として、そう決めてある。
 */
export async function deleteSessionCore(root: string, sessionId: string): Promise<void> {
  if (!(await sessionExistsCore(root, sessionId))) {
    throw new SessionCoreError('not-found', `そのセッションは無い: ${sessionId}`)
  }
  try {
    await fse.remove(sessionDir(root, sessionId))
  } catch (error) {
    throw new SessionCoreError(
      'io',
      `セッションを消せなかった: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * セッションの実体が揃っているか。ディレクトリが既に作成されているか・openspec ルートが
 * あるか・その `config.yaml` が変更された内容（`schema: <名前>` の書き込み済み）に
 * なっているかを検査する。全部パスしたものだけを一覧に出す。
 */
async function passesListChecks(root: string, sessionId: string): Promise<boolean> {
  try {
    const dir = await stat(sessionDir(root, sessionId))
    if (!dir.isDirectory()) return false
    const openspecDir = await stat(join(sessionDir(root, sessionId), OPENSPEC_DIR))
    if (!openspecDir.isDirectory()) return false
    const config = await readFile(
      join(sessionDir(root, sessionId), OPENSPEC_DIR, OPENSPEC_CONFIG_FILE),
      'utf8',
    )
    return /^schema:\s*\S+/m.test(config)
  } catch {
    return false
  }
}

/**
 * 残っているセッションの一覧。ディレクトリ・openspec・`config.yaml`（スキーマ書き込み済み）
 * の検査を全部パスしたものだけを載せる。各件は id・phase・時点情報（`state.json` の mtime）。
 * `state.json` が読めない・phase が取れないものは `unknown` として載せる（見えなくすると
 * 消す判断ができない）。新しいものから並べる。
 *
 * 保存先にはセッション（uuid）と昇格したプロジェクト（名前）が並ぶ。**どちらも載せる。**
 * 昇格後の対象は steering の巡回・再キックの対象になるためである（design.md Risks）。
 * 名前の形では絞らない——絞ると昇格した瞬間に一覧から消え、巡回が拾えなくなる。
 *
 * 保存先には無関係なディレクトリも並びうるが、`state.json` を持たないものは下の検査で
 * 落ちるので載らない。
 */
export async function listSessionsCore(root: string): Promise<SessionSummary[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const sessions: SessionSummary[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!(await passesListChecks(root, entry.name))) continue
    let mtime: Date
    try {
      const s = await stat(sessionFile(root, entry.name, SESSION_FILES.state))
      if (!s.isFile()) continue
      mtime = s.mtime
    } catch {
      continue
    }
    sessions.push({
      id: entry.name,
      phase: await readPhase(root, entry.name),
      updatedAt: mtime.toISOString(),
      // キックする側がこれを cwd として U13 に渡す。endpoint に導出させない（D5）
      path: sessionDir(root, entry.name),
      invocation: await readInvocation(root, entry.name),
    })
  }
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * `state.json` の `invocation` を読む。script の削除受理判定に使う（design.md 決定5:
 * サーバ無しの経路では保存された状態を実行中判定の材料にする）。読めなければ null。
 */
export async function readInvocationCore(
  root: string,
  sessionId: string,
): Promise<string | null> {
  try {
    const raw = JSON.parse(
      await readFile(sessionFile(root, sessionId, SESSION_FILES.state), 'utf8'),
    )
    return typeof raw?.invocation === 'string' ? raw.invocation : null
  } catch {
    return null
  }
}

/**
 * 一覧に載せる `invocation`。読めない・知らない値は `idle` として載せる。
 *
 * 巡回は `failed` だけを拾うので、読めないものを `failed` に倒すと、壊れた
 * `state.json` を延々と起こし直すことになる。
 */
async function readInvocation(root: string, sessionId: string): Promise<Invocation> {
  const raw = await readInvocationCore(root, sessionId)
  return raw === 'running' || raw === 'failed' || raw === 'error' ? raw : 'idle'
}

async function readPhase(root: string, sessionId: string): Promise<SessionSummary['phase']> {
  try {
    const raw = JSON.parse(
      await readFile(sessionFile(root, sessionId, SESSION_FILES.state), 'utf8'),
    )
    const phase = raw?.phase
    return phase === 'stroking' || phase === 'proposed' || phase === 'approved' ? phase : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * 書きかけを残さない。同じディレクトリへ書いてから rename するので、
 * 読み手が見るのは常に前の版か新しい版のどちらかになる。
 */
export async function writeAtomic(
  root: string,
  sessionId: string,
  name: string,
  contents: string,
): Promise<void> {
  const target = sessionFile(root, sessionId, name)
  const temp = `${target}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, contents, 'utf8')
    await rename(temp, target)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw new SessionCoreError(
      'io',
      `${name} を書けなかった: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
