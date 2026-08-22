import { readClaudeConfig } from './claude-config'
import { runClaude, type ClaudeMode, type ClaudeRunResult } from './claude'
import { sessionDir } from './paths'
import { initSessionOpenspec } from './openspec'
import { continuePrompt, firstPrompt } from './prompt'
import { listSessionsCore } from './session-core'
import { readState, writeState } from './session-store'
import { waitForSubmission } from './submission-signal'

/** リトライ回数。MVP の割り切りで設定値にしない。 */
const MAX_RETRIES = 2

type AttemptOutcome =
  | { kind: 'submitted' }
  | { kind: 'failed', detail: string, sessionMissing: boolean }

/**
 * AI を呼ぶ。呼び出し側は結果を待たない（design.md 決定2・6: HTTP は受理・返却して
 * 即完結する）。結果はエージェントの提出（A5・A7）が endpoint へ直接届けるため、この関数の
 * 返り値には載らない。
 *
 * 初回か継続か・渡す定型は呼び出し側から受け取らない。一覧 API の実体
 * （`listSessionsCore`）を叩き、符合する id があれば有効（= 継続）、無ければ初回と判定する。
 *
 * 呼び出し側は、この呼び出しを始める前に `beginRun(sessionId)` を済ませ、返ってきた
 * promise に `.finally(() => endRun(sessionId))` を付けること（busy ガードの対称性）。
 *
 * 起動後タイムアウト時間内に endpoint への提出が無ければ、その試行を失敗として扱い、
 * 既存のリトライ（続きを促す再起動・入力は送り直さない）へ流す（specs/ai-invocation）。
 * 尽きたら `invocation: failed` を state.json に書く。502 は返さない。
 */
export async function invokeAi(sessionId: string): Promise<void> {
  const cwd = sessionDir(sessionId)
  const config = readClaudeConfig()
  const timeoutMs = config.timeoutMs

  // 初回判定: 一覧 API の実体を叩き、符合する id があれば有効（= 継続）、無ければ初回。
  // 一覧はディレクトリ・openspec・config.yaml（スキーマ書き込み済み）の検査を
  // 全部パスしたものだけを載せる。
  const valid = (await listSessionsCore()).some((s) => s.id === sessionId)
  const first = !valid

  if (first) {
    // 実行環境（openspec ルート初期化 + config.yaml）は invokeAi が初回に自分で作る
    // （ユーザー決定）。これを終えると一覧の検査を通るので、以降の判定は継続になる。
    try {
      await initSessionOpenspec(cwd, config.workflowSchema)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.warn(`[stroke-board] AI 呼び出しが失敗: ${sessionId}`, [`実行環境を作れない: ${detail}`])
      await markInvocationFailed(sessionId)
      return
    }
  }
  let mode: ClaudeMode = first ? 'new' : 'resume'
  let prompt = first ? firstPrompt() : continuePrompt()
  const failures: string[] = []

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const outcome = await attemptOnce({ sessionId, cwd, prompt, mode, timeoutMs })

    if (outcome.kind === 'submitted') return

    failures.push(outcome.detail)
    if (outcome.sessionMissing) {
      if (!first) {
        // 往復の途中で継続先を失った。ここから `--session-id` で始め直すと、概要も
        // 過去のストロークも無い会話へ入力だけを流し込むことになる。
        failures.push('継続先のセッションが失われた（初回ではないので作り直さない）')
        break
      }
      // 初回。継続先が無い = 履歴には何も入っていない。送り直してよい。
      mode = 'new'
      prompt = firstPrompt()
      continue
    }

    mode = 'resume'
    prompt = continuePrompt()
  }

  console.warn(`[stroke-board] AI 呼び出しが失敗: ${sessionId}`, failures)
  await markInvocationFailed(sessionId)
}

/**
 * 1回の試行。提出到着とプロセスの終了を競わせ、先に決着した方で結果を決める。
 * 提出が届けば即成功。プロセスが（成功・失敗いずれであれ）提出より先に終われば、
 * その試行は失敗として扱う（提出が受け取り口であり、応答の中身は見ない）。
 */
function attemptOnce(options: {
  sessionId: string
  cwd: string
  prompt: string
  mode: ClaudeMode
  timeoutMs: number
}): Promise<AttemptOutcome> {
  const { sessionId, cwd, prompt, mode, timeoutMs } = options

  return new Promise((resolve) => {
    let settled = false
    const finish = (outcome: AttemptOutcome): void => {
      if (settled) return
      settled = true
      resolve(outcome)
    }

    waitForSubmission(sessionId, timeoutMs).then((submitted) => {
      if (submitted) finish({ kind: 'submitted' })
    })

    runClaude({ sessionId, cwd, prompt, mode }).then((run: ClaudeRunResult) => {
      if (run.ok) {
        finish({ kind: 'failed', detail: '応答は成功したが提出が届かない', sessionMissing: false })
      } else {
        finish({ kind: 'failed', detail: run.detail, sessionMissing: run.sessionMissing })
      }
    })
  })
}

async function markInvocationFailed(sessionId: string): Promise<void> {
  const state = await readState(sessionId)
  if (state.phase === 'approved') return
  await writeState(sessionId, { ...state, invocation: 'failed' })
}
