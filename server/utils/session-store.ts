import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import type { Answer, Invocation, Question, SendBackPayload, Stroke } from '#shared/types'
import { sessionDir, sessionFile } from './paths'
import { questionSchema } from './question'
import { sendBackBody } from './request-schemas'

/**
 * `state.json` の中身。
 *
 * uuid はディレクトリ名なので持たない。会話の全文も持たない（`--resume` が持つ）。
 * proposal 本文は `proposal.md` を読めば得られるため、状態には持たない。
 *
 * `stroking` / `proposed` は「今の1問」と呼び出し実行状態を持つ点で同じ形（design.md
 * 決定3・決定4: 問いと問い返しを区別せず、phase で受理の動きを変えない）。`approved` は
 * 呼び出しが二度と起きないので、その2つを持たない。
 */
export type SessionState =
  | {
      phase: 'stroking' | 'proposed'
      /** 今ユーザーが答えるべき問い。エージェントの提出（A5）で更新される。まだ無ければ null */
      currentQuestion: Question | null
      /** AI が提案した kebab-case のプロジェクト名候補。取れないことがある */
      projectName?: string
      invocation: Invocation
    }
  | {
      phase: 'approved'
      /** 承認時に確定した名前 */
      projectName: string
    }

const STATE_FILE = 'state.json'
const STROKES_FILE = 'strokes.json'
const PROPOSAL_FILE = 'proposal.md'
const OVERVIEW_FILE = 'overview.txt'
const SEND_BACK_FILE = 'send-back.json'

const projectNameSchema = z.string().trim().min(1).max(100)
const invocationSchema = z.enum(['running', 'idle', 'failed'])

const activeStateFields = {
  currentQuestion: z.union([z.null(), questionSchema]),
  projectName: projectNameSchema.optional(),
  invocation: invocationSchema,
}

const stateSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('stroking'), ...activeStateFields }),
  z.object({ phase: z.literal('proposed'), ...activeStateFields }),
  z.object({ phase: z.literal('approved'), projectName: projectNameSchema }),
])

const answerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('option'), value: z.string().min(1) }),
  z.object({ kind: z.literal('free'), value: z.string().min(1) }),
])

const strokeSchema = z.discriminatedUnion('proposal', [
  z.object({ proposal: z.literal(false), question: questionSchema, answer: answerSchema }),
  z.object({ proposal: z.literal(true), question: z.null(), answer: z.null() }),
])

const strokesSchema = z.array(strokeSchema)

/**
 * セッションを開始する。概要を保存し、`state.json` を最初から書く（`stroking` / 問い無し /
 * `invocation: running`）。呼び出し側はこの直後に最初の AI 呼び出しを始める前提。
 *
 * 旧実装と違い、最初の問いが得られるのを待たない（HTTP はステートレス・design.md）。
 * そのため `state.json` は最初からここで書き、セッションはこの時点で「在る」ものとして扱う。
 */
export async function createSession(overview: string): Promise<string> {
  const sessionId = randomUUID()
  await mkdir(sessionDir(sessionId), { recursive: true })
  await writeAtomic(sessionId, OVERVIEW_FILE, overview)
  await writeStrokes(sessionId, [])
  await writeState(sessionId, {
    phase: 'stroking',
    currentQuestion: null,
    invocation: 'running',
  })
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

/** U1 で投稿された概要。A1 が読む。 */
export async function readOverview(sessionId: string): Promise<string | undefined> {
  try {
    return await readFile(sessionFile(sessionId, OVERVIEW_FILE), 'utf8')
  } catch {
    return undefined
  }
}

/** U9 で差し戻された指摘一式。A4 が読む。差し戻しがまだ無ければ undefined。 */
export async function readSendBack(sessionId: string): Promise<SendBackPayload | undefined> {
  let raw: string
  try {
    raw = await readFile(sessionFile(sessionId, SEND_BACK_FILE), 'utf8')
  } catch {
    return undefined
  }
  const parsed = sendBackBody.safeParse(readJson(raw, SEND_BACK_FILE, sessionId))
  if (!parsed.success) throw corrupt(SEND_BACK_FILE, sessionId)
  return parsed.data
}

export async function writeSendBack(sessionId: string, payload: SendBackPayload): Promise<void> {
  await writeAtomic(sessionId, SEND_BACK_FILE, `${JSON.stringify(payload, null, 2)}\n`)
}

/**
 * 済んだストローク。`proposal: false` は問いと回答のペア行（問い返しの往復も含む）、
 * `proposal: true` は proposal の初提出を示すマーカー行。
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

/** 今の1問への回答をペア行として追記する。U7 受理で呼ぶ。 */
export async function appendAnswerStroke(
  sessionId: string,
  question: Question,
  answer: Answer,
): Promise<void> {
  await appendStroke(sessionId, { proposal: false, question, answer })
}

/**
 * proposal の初提出だけマーカー行を追記する。出し直しでは増やさない
 * （strokes に `proposal: true` が既に無いかで「初めて」を判定する）。
 */
export async function markProposalStrokeIfFirst(sessionId: string): Promise<void> {
  const strokes = await readStrokes(sessionId)
  if (strokes.some((s) => s.proposal)) return
  strokes.push({ proposal: true, question: null, answer: null })
  await writeStrokes(sessionId, strokes)
}

async function writeStrokes(sessionId: string, strokes: Stroke[]): Promise<void> {
  await writeAtomic(sessionId, STROKES_FILE, `${JSON.stringify(strokes, null, 2)}\n`)
}

/** 最新の proposal 本文。A7 の受理でサーバが書く（decisions 7: 書き手はサーバの1つだけ）。 */
export async function readProposal(sessionId: string): Promise<string | undefined> {
  try {
    return await readFile(sessionFile(sessionId, PROPOSAL_FILE), 'utf8')
  } catch {
    return undefined
  }
}

export async function writeProposal(sessionId: string, proposal: string): Promise<void> {
  await writeAtomic(sessionId, PROPOSAL_FILE, proposal)
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
