import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { Answer, Invocation, Question, SendBackPayload, Stroke } from '#shared/stroke'
import type { ProjectCreationOutcome } from '#shared/types'
import { broadcastProjectCreation } from '../control/board'
import { conflict } from './conflict'
import { sessionFile } from './paths'
import { PROJECT_DOCS_DIR, PROJECT_PROPOSAL_FILE } from './project'
import { questionSchema } from './question'
import { sendBackBody } from './request-schemas'
import {
  SESSION_FILES,
  SessionCoreError,
  createSessionCore,
  sessionExistsCore,
  writeAtomic as writeAtomicCore,
} from './session-core'

/**
 * 保存先を解決する端。
 *
 * core（`session-core.ts` / `paths.ts`）は設定を引かず `root` を引数で受け取る。
 * このモジュールは `createError` を使う Nitro 専用なので、ここが endpoint 側の端になる
 * （CLI 側の端は `scripts/session.ts`）。docs/specs/core/settings-reference.md 参照。
 */
function shareRoot(): string {
  return useRuntimeConfig().projectShareRoot
}

/**
 * `state.json` の中身。
 *
 * uuid はディレクトリ名なので持たない。会話の全文も持たない（`--resume` が持つ）。
 * proposal 本文は `proposal.md` を読めば得られるため、状態には持たない。
 *
 * `stroking` / `proposed` は「今の1問」を持つ点で同じ形（design.md 決定3・決定4: 問いと
 * 問い返しを区別せず、phase で受理の動きを変えない）。`approved` は問いを持たない。
 *
 * **`invocation` と `retries` は3つの phase すべてが持つ。** 承認で昇格したプロジェクトでも
 * steering の実行が起こるため、実行の記録は `approved` でも要る
 * （openspec/specs/agent/invocation「phase が `approved` の対象も `invocation` を持つ」）。
 */
export type SessionState =
  | {
      phase: 'stroking' | 'proposed'
      /** 今ユーザーが答えるべき問い。エージェントの提出（A5）で更新される。まだ無ければ null */
      currentQuestion: Question | null
      /** AI が提案した kebab-case のプロジェクト名候補。取れないことがある */
      projectName?: string
      invocation: Invocation
      /** 起こし直した回数。上限判定は invokeAi が行う。省略は 0 と同じ */
      retries?: number
    }
  | {
      phase: 'approved'
      /** 承認時に確定した名前 */
      projectName: string
      invocation: Invocation
      retries?: number
      /**
       * steering の会話 id。
       *
       * ストロークと違い自前採番しない——ディレクトリ名がプロジェクト名になっており
       * uuid ではないためで、`--session-id` は uuid しか受け付けない（実測）。初回は
       * claude に採番させ、output stream から拾った id をここに覚えて次から `--resume`
       * する。**あるかどうかが初回/継続の判定でもある。**
       */
      runId?: string
    }

const projectNameSchema = z.string().trim().min(1)
const invocationSchema = z.enum(['running', 'idle', 'failed', 'error'])
const retriesSchema = z.number().int().min(0).optional()

const activeStateFields = {
  currentQuestion: z.union([z.null(), questionSchema]),
  projectName: projectNameSchema.optional(),
  invocation: invocationSchema,
  retries: retriesSchema,
}

const stateSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('stroking'), ...activeStateFields }),
  z.object({ phase: z.literal('proposed'), ...activeStateFields }),
  z.object({
    phase: z.literal('approved'),
    projectName: projectNameSchema,
    // 既存の `approved` は `invocation` を持たないので、読めるように既定値を与える
    invocation: invocationSchema.default('idle'),
    retries: retriesSchema,
    runId: z.string().trim().min(1).optional(),
  }),
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
 * `invocation: idle`）。AI の起動は受理に含まれず、フロントが受理後に invoke-agent へ
 * 要求したとき `running` になる（specs/api/overview・specs/api/invoke-agent）。
 * openspec ルートの初期化もここではやらない（invokeAi が初回に行う）。
 *
 * 最初の問いが得られるのを待たない（HTTP はステートレス・design.md）。
 * `state.json` は最初からここで書き、セッションはこの時点で「在る」ものとして扱う。
 */
export async function createSession(overview: string): Promise<string> {
  // 実体は core（design.md 決定3: endpoint と script で同じ実装を呼ぶ）。
  try {
    return await createSessionCore(shareRoot(), overview, 'idle')
  } catch (error) {
    throw sessionErrorToHttp(error)
  }
}

/** セッションとして成立しているか。`state.json` が在ることをもって在るとする。 */
export async function sessionExists(sessionId: string): Promise<boolean> {
  return sessionExistsCore(shareRoot(), sessionId)
}

/** core の失敗を HTTP へ写す。endpoint 側の共通の出口。 */
export function sessionErrorToHttp(error: unknown) {
  const kind = error instanceof SessionCoreError ? error.kind : 'io'
  const message = error instanceof Error ? error.message : String(error)

  if (kind === 'phase') {
    // 今の phase に当てはまらない操作。画面は 409 を「待てば通る」と読むが、
    // これは待っても通らない——それでも既存の 409 の語彙に揃える（utils/conflict）。
    return conflict('phase', message)
  }
  const notFound = kind === 'not-found'
  return createError({
    statusCode: notFound ? 404 : 500,
    statusMessage: notFound ? 'Not Found' : 'Internal Server Error',
    message,
  })
}

export async function readState(sessionId: string): Promise<SessionState> {
  const name = SESSION_FILES.state
  const raw = await readFile(sessionFile(shareRoot(), sessionId, name), 'utf8')
  const parsed = stateSchema.safeParse(readJson(raw, name, sessionId))
  if (!parsed.success) throw corrupt(name, sessionId)
  return parsed.data
}

/**
 * 実行の記録（`invocation`）を書く。
 *
 * **この1本が書き込みの規則である。** A8 の endpoint（`submission.post.ts`）も、invokeAi
 * へ渡す書き込み口（`invoke.ts`）も、ここを呼ぶ。規則を2箇所に写さないため。
 *
 * 値はそのまま書く。回数は渡されたときだけ上書きする（`error` からの再実行で 0 に戻す）。
 */
export async function writeInvocation(
  sessionId: string,
  invocation: Invocation,
  retries?: number,
): Promise<void> {
  const state = await readState(sessionId)
  await writeState(sessionId, {
    ...state,
    invocation,
    ...(retries === undefined ? {} : { retries }),
  })

  // 昇格したプロジェクトの実行だけが上層に関係する。ストロークのセッション（uuid）の
  // 実行は一覧に出ないので流さない。
  //
  // **ここに置くのは、`invocation` の書き込みが必ずここを通るからである**（A8 の endpoint も
  // invokeAi へ渡す書き込み口も、同じこの実体を呼ぶ）。呼び出し側それぞれに置くと、書いたのに
  // 流れない経路が生まれる。
  //
  // **流すのは合図であって、行の状態ではない。** 一覧の行が生成中か完了かは
  // ファイルシステム（`.spec-workflow/` の有無）から毎回導く（design.md D7）。ここは
  // 「何かが決着したから取り直せ」と、モーダルを出す引き金を伝えるだけである。だから
  // `invocation` を合図の材料に使っても、行の判定が `invocation` に依存することはない。
  const outcome = creationOutcomeOf(state.phase, invocation)
  if (outcome !== null) broadcastProjectCreation(sessionId, outcome)
}

/**
 * その書き込みが上層への合図になるか。なるなら何を流すか。
 *
 * **判定だけを切り出してある。** 書き込みの副作用と混ぜると、条件を確かめるのに保存先と
 * Nitro の設定が要る。ここは phase と `invocation` だけを見る。
 *
 * - 昇格していない（ストロークのセッション）→ 流さない。一覧に出ないので上層に関係がない
 * - `failed` → 流さない。巡回が起こし直す途中で、決着ではない。流すと勝手に直る行ができる
 * - `running` → 流さない。始まっただけで、決着ではない
 */
export function creationOutcomeOf(
  phase: SessionState['phase'],
  invocation: Invocation,
): ProjectCreationOutcome | null {
  if (phase !== 'approved') return null
  if (invocation === 'idle') return 'done'
  if (invocation === 'error') return 'failed'
  return null
}

export async function writeState(sessionId: string, state: SessionState): Promise<void> {
  await writeAtomic(sessionId, SESSION_FILES.state, `${JSON.stringify(state, null, 2)}\n`)
}

/** U1 で投稿された概要。A1 が読む。 */
export async function readOverview(sessionId: string): Promise<string | undefined> {
  try {
    return await readFile(sessionFile(shareRoot(), sessionId, SESSION_FILES.overview), 'utf8')
  } catch {
    return undefined
  }
}

/** U9 で差し戻された指摘一式。A4 が読む。差し戻しがまだ無ければ undefined。 */
export async function readSendBack(sessionId: string): Promise<SendBackPayload | undefined> {
  const name = SESSION_FILES.sendBack
  let raw: string
  try {
    raw = await readFile(sessionFile(shareRoot(), sessionId, name), 'utf8')
  } catch {
    return undefined
  }
  const parsed = sendBackBody.safeParse(readJson(raw, name, sessionId))
  if (!parsed.success) throw corrupt(name, sessionId)
  return parsed.data
}

export async function writeSendBack(sessionId: string, payload: SendBackPayload): Promise<void> {
  await writeAtomic(sessionId, SESSION_FILES.sendBack, `${JSON.stringify(payload, null, 2)}\n`)
}

/**
 * 済んだストローク。`proposal: false` は問いと回答のペア行（問い返しの往復も含む）、
 * `proposal: true` は proposal の初提出を示すマーカー行。
 */
export async function readStrokes(sessionId: string): Promise<Stroke[]> {
  const name = SESSION_FILES.strokes
  let raw: string
  try {
    raw = await readFile(sessionFile(shareRoot(), sessionId, name), 'utf8')
  } catch {
    return []
  }
  const parsed = strokesSchema.safeParse(readJson(raw, name, sessionId))
  if (!parsed.success) throw corrupt(name, sessionId)
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
  await writeAtomic(sessionId, SESSION_FILES.strokes, `${JSON.stringify(strokes, null, 2)}\n`)
}

/** セッションから見た proposal の位置。`docs/proposal.md` を書くのはここ1箇所だけ。 */
const PROPOSAL_PATH = join(PROJECT_DOCS_DIR, PROJECT_PROPOSAL_FILE)

/**
 * proposal の本体を扱う1つの口。**読みと書きを分けない。**
 *
 * 分けると、置き場所の規定が読み手と書き手に散る。この不具合はまさにそれで起きた——
 * 読み手（画面2 の接続時配信・承認）だけが `docs/proposal.md` を前提にし、書き手が
 * 誰も居ないまま残った（openspec/changes/write-proposal-to-docs）。
 *
 * proposal はセッションの時点から `docs/proposal.md` に在り、昇格はディレクトリごとの
 * 改名なのでこのファイルを動かさない。昇格後は `<name>/docs/proposal.md` としてそのまま
 * 読める（openspec/specs/project/generation）。
 */
export function sessionProposal(sessionId: string) {
  const path = (): string => sessionFile(shareRoot(), sessionId, PROPOSAL_PATH)

  return {
    /** 最新の proposal 本文。まだ無ければ undefined を返し、承認は 409 で止まる。 */
    async read(): Promise<string | undefined> {
      try {
        return await readFile(path(), 'utf8')
      } catch {
        return undefined
      }
    },

    /**
     * 受理した proposal を残す。呼び出し側はこれが成功してから受理を成立させる
     * （openspec/specs/api/stroke/proposal「残せなければ受理しない」）。
     *
     * 出し直しは上書きで、残るのは常に最後に受理した1件だけ。往復の記録は
     * `strokes.json` が持つので、proposal の過去版を読む相手は居ない。
     *
     * `docs/` は在るとは限らない（セッションの作成時には作られない）ので、ここで用意する。
     */
    async write(proposal: string): Promise<void> {
      try {
        await mkdir(dirname(path()), { recursive: true })
      } catch (error) {
        throw sessionErrorToHttp(
          new SessionCoreError(
            'io',
            `proposal の置き場を作れなかった: ${error instanceof Error ? error.message : String(error)}`,
          ),
        )
      }

      // 書きかけを読ませない。失敗は HTTP へ写り、呼び出し側の受理が成立しない
      await writeAtomic(sessionId, PROPOSAL_PATH, proposal)
    },
  }
}

/** 原子的な書き込みの実体は core。失敗はここで HTTP へ写す。 */
async function writeAtomic(sessionId: string, name: string, contents: string): Promise<void> {
  try {
    await writeAtomicCore(shareRoot(), sessionId, name, contents)
  } catch (error) {
    throw sessionErrorToHttp(error)
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
