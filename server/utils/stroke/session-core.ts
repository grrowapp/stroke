import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import fse from 'fs-extra'
import type { Invocation, SessionSummary } from '#shared/stroke'
import { sessionDir, sessionFile } from './paths'
import {
  OPENSPEC_CONFIG_FILE,
  OPENSPEC_DIR,
  SESSION_FILES,
  resolveSessionsRoot,
} from './settings'

/**
 * セッションの作成・削除・列挙の実体。endpoint（Nitro）と script（tsx）の両方から
 * 同じこの実装を呼ぶ（design.md 決定3: 同じ規定を2つ実装しない）。
 *
 * Nitro に依存しない: `useRuntimeConfig` は呼ばず必要な値は引数で受け、失敗は
 * `createError` ではなく種別を持つ `SessionCoreError` で表す。HTTP のステータスへの
 * 写しは endpoint 側、終了コードへの写しは script 側の責務。
 */

export type SessionCoreErrorKind = 'not-found' | 'io'

export class SessionCoreError extends Error {
  constructor(
    public readonly kind: SessionCoreErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'SessionCoreError'
  }
}

// セッション内のファイル名の出どころは settings.ts の `SESSION_FILES`（固定値）。

/** uuid の形をしていないものはディレクトリ名として受け付けない。 */
export function isSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
}

/** セッションとして成立しているか。`state.json` が在ることをもって在るとする。 */
export async function sessionExistsCore(sessionId: string): Promise<boolean> {
  if (!isSessionId(sessionId)) return false
  try {
    const s = await stat(sessionFile(sessionId, SESSION_FILES.state))
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
  overview: string,
  invocation: Invocation,
): Promise<string> {
  const sessionId = randomUUID()
  try {
    await mkdir(sessionDir(sessionId), { recursive: true })
    await writeAtomic(sessionId, SESSION_FILES.overview, overview)
    await writeAtomic(sessionId, SESSION_FILES.strokes, `${JSON.stringify([], null, 2)}\n`)
    const state = { phase: 'stroking', currentQuestion: null, invocation }
    await writeAtomic(sessionId, SESSION_FILES.state, `${JSON.stringify(state, null, 2)}\n`)
    return sessionId
  } catch (error) {
    await fse.remove(sessionDir(sessionId)).catch(() => {})
    throw new SessionCoreError(
      'io',
      `セッションを作れなかった: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * セッションを消す。存在検査 → `fs-extra` の `remove(sessionDir)` の1関数（design.md 決定4）。
 * 存在しない id は何も消さず失敗にする（`remove` は存在しないパスで沈黙するため、
 * 検査を先に置くことで「無いものを消した」ことにしない）。
 */
export async function deleteSessionCore(sessionId: string): Promise<void> {
  if (!(await sessionExistsCore(sessionId))) {
    throw new SessionCoreError('not-found', `そのセッションは無い: ${sessionId}`)
  }
  try {
    await fse.remove(sessionDir(sessionId))
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
async function passesListChecks(sessionId: string): Promise<boolean> {
  try {
    const dir = await stat(sessionDir(sessionId))
    if (!dir.isDirectory()) return false
    const openspecDir = await stat(join(sessionDir(sessionId), OPENSPEC_DIR))
    if (!openspecDir.isDirectory()) return false
    const config = await readFile(
      join(sessionDir(sessionId), OPENSPEC_DIR, OPENSPEC_CONFIG_FILE),
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
 */
export async function listSessionsCore(): Promise<SessionSummary[]> {
  let entries
  try {
    entries = await readdir(resolveSessionsRoot(), { withFileTypes: true })
  } catch {
    return []
  }
  const sessions: SessionSummary[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSessionId(entry.name)) continue
    if (!(await passesListChecks(entry.name))) continue
    let mtime: Date
    try {
      const s = await stat(sessionFile(entry.name, SESSION_FILES.state))
      if (!s.isFile()) continue
      mtime = s.mtime
    } catch {
      continue
    }
    sessions.push({
      id: entry.name,
      phase: await readPhase(entry.name),
      updatedAt: mtime.toISOString(),
    })
  }
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * `state.json` の `invocation` を読む。script の削除受理判定に使う（design.md 決定5:
 * サーバ無しの経路では保存された状態を実行中判定の材料にする）。読めなければ null。
 */
export async function readInvocationCore(sessionId: string): Promise<string | null> {
  try {
    const raw = JSON.parse(await readFile(sessionFile(sessionId, SESSION_FILES.state), 'utf8'))
    return typeof raw?.invocation === 'string' ? raw.invocation : null
  } catch {
    return null
  }
}

async function readPhase(sessionId: string): Promise<SessionSummary['phase']> {
  try {
    const raw = JSON.parse(await readFile(sessionFile(sessionId, SESSION_FILES.state), 'utf8'))
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
export async function writeAtomic(sessionId: string, name: string, contents: string): Promise<void> {
  const target = sessionFile(sessionId, name)
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
