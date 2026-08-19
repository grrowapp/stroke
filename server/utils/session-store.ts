import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import type { Question, Stroke } from '#shared/types'
import { sessionDir, sessionFile } from './paths'
import { questionSchema } from './question'

/**
 * `state.json` の中身。
 *
 * uuid はディレクトリ名なので持たない。会話の全文も持たない（`--resume` が持つ）。
 * proposal 本文は `proposal.md` を読めば得られるため、状態には持たない。
 *
 * 局面ごとに存在するものが違うので `phase` を判別子にした直和型で表す。
 * 「stroking なのに projectName がある」のような組み合わせを作れないようにする。
 */
export type SessionState =
  | {
      phase: 'stroking'
      /** 今ユーザーが答えるべき問い */
      question: Question
    }
  | {
      phase: 'proposed'
      /** AI が提案した kebab-case のプロジェクト名。取れないことがある */
      projectName?: string
      /** 差し戻しに対する AI の問い返し。答えを待っていなければ null */
      followupQuestion: Question | null
    }
  | {
      phase: 'approved'
      /** 承認時に確定した名前 */
      projectName: string
    }

const STATE_FILE = 'state.json'
const STROKES_FILE = 'strokes.json'
const PROPOSAL_FILE = 'proposal.md'

const projectNameSchema = z.string().trim().min(1).max(100)

/** null / undefined は「待っている問いは無い」に倒す。 */
const followupSchema = z.union([z.null(), z.undefined(), questionSchema]).transform(v => v ?? null)

const stateSchema = z.discriminatedUnion('phase', [
  z.object({
    phase: z.literal('stroking'),
    question: questionSchema,
  }),
  z.object({
    phase: z.literal('proposed'),
    projectName: projectNameSchema.optional(),
    followupQuestion: followupSchema,
  }),
  z.object({
    phase: z.literal('approved'),
    projectName: projectNameSchema,
  }),
])

const answerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('option'), value: z.string().min(1) }),
  z.object({ kind: z.literal('free'), value: z.string().min(1) }),
])

const strokesSchema = z.array(z.object({
  question: questionSchema,
  answer: answerSchema,
}))

/** セッションディレクトリを1つ作り、uuid を返す。uuid は `--session-id` にも使う。 */
export async function createSession(): Promise<string> {
  const sessionId = randomUUID()
  await mkdir(sessionDir(sessionId), { recursive: true })
  await writeStrokes(sessionId, [])
  // state.json は最初の問いが得られてから書く。最初の呼び出しが失敗して捨てられた
  // ディレクトリを「在るセッション」として拾わないため。
  return sessionId
}

/** セッションとして成立しているか。`state.json` が在ることをもって在るとする。 */
export async function sessionExists(sessionId: string): Promise<boolean> {
  if (!isSessionId(sessionId)) return false
  try {
    const s = await stat(sessionFile(sessionId, STATE_FILE))
    return s.isFile()
  } catch {
    return false
  }
}

/** uuid の形をしていないものはディレクトリ名として受け付けない。 */
export function isSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
}

export async function readState(sessionId: string): Promise<SessionState> {
  const raw = await readFile(sessionFile(sessionId, STATE_FILE), 'utf8')
  const parsed = stateSchema.safeParse(readJson(raw, STATE_FILE, sessionId))
  if (!parsed.success) throw corrupt(STATE_FILE, sessionId)
  return parsed.data
}

export async function writeState(sessionId: string, state: SessionState): Promise<void> {
  await writeAtomic(sessionId, STATE_FILE, `${JSON.stringify(state, null, 2)}\n`)
}

/**
 * 済んだストローク。画面に出した問い（提示した選択肢を含む）と、ユーザーが返した回答の
 * ペアだけを持つ。AI の思考や中間の出力は保存しない。
 */
export async function readStrokes(sessionId: string): Promise<Stroke[]> {
  let raw: string
  try {
    raw = await readFile(sessionFile(sessionId, STROKES_FILE), 'utf8')
  } catch {
    return []
  }
  const parsed = strokesSchema.safeParse(readJson(raw, STROKES_FILE, sessionId))
  if (!parsed.success) throw corrupt(STROKES_FILE, sessionId)
  return parsed.data
}

export async function appendStroke(sessionId: string, stroke: Stroke): Promise<void> {
  const strokes = await readStrokes(sessionId)
  strokes.push(stroke)
  await writeStrokes(sessionId, strokes)
}

async function writeStrokes(sessionId: string, strokes: Stroke[]): Promise<void> {
  await writeAtomic(sessionId, STROKES_FILE, `${JSON.stringify(strokes, null, 2)}\n`)
}

/** 最新の proposal 本文。AI がセッションディレクトリへ書いたもの。 */
export async function readProposal(sessionId: string): Promise<string | undefined> {
  try {
    return await readFile(sessionFile(sessionId, PROPOSAL_FILE), 'utf8')
  } catch {
    return undefined
  }
}

/**
 * `proposal.md` の更新時刻。まだ無ければ null。
 *
 * AI が proposal を書いたかどうかは、呼び出しの前後でこれを比べて判定する。応答の本文から
 * 当てにいかないのは、proposal は**ファイルとして**書かれるものであり、標準出力に現れる
 * 保証が無いため。
 */
export async function readProposalStamp(sessionId: string): Promise<number | null> {
  try {
    const s = await stat(sessionFile(sessionId, PROPOSAL_FILE))
    return s.mtimeMs
  } catch {
    return null
  }
}

/**
 * 書きかけを残さない。同じディレクトリへ書いてから rename するので、
 * 読み手が見るのは常に前の版か新しい版のどちらかになる。
 */
async function writeAtomic(sessionId: string, name: string, contents: string): Promise<void> {
  const target = sessionFile(sessionId, name)
  const temp = `${target}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, contents, 'utf8')
    await rename(temp, target)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: `${name} を書けなかった: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

function readJson(raw: string, name: string, sessionId: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    throw corrupt(name, sessionId)
  }
}

/** 保存したものが読み戻せないのは、こちらの落ち度。契約外の例外にせず 500 で返す。 */
function corrupt(name: string, sessionId: string) {
  return createError({
    statusCode: 500,
    statusMessage: 'Internal Server Error',
    message: `${name} が壊れている: ${sessionId}`,
  })
}
