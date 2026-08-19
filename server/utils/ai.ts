import { readClaudeConfig } from './claude-config'
import { runClaude, type ClaudeMode, type ClaudeRunResult } from './claude'
import { sessionDir } from './paths'
import { continuePrompt } from './prompt'
import { readState, writeState } from './session-store'
import { waitForSubmission } from './submission-signal'

export interface InvokeAiOptions {
  sessionId: string
  /** 最初の呼び出しで渡す固定テンプレート（`sessionPrompt`）。リトライでは送り直さない */
  prompt: string
  /** セッションの最初の呼び出しか。true なら `--session-id`、false なら `--resume` */
  first: boolean
}

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
 * 呼び出し側は、この呼び出しを始める前に `beginRun(sessionId)` を済ませ、返ってきた
 * promise に `.finally(() => endRun(sessionId))` を付けること（busy ガードの対称性）。
 *
 * 起動後タイムアウト時間内に endpoint への提出が無ければ、その試行を失敗として扱い、
 * 既存のリトライ（続きを促す再起動・入力は送り直さない）へ流す（specs/ai-invocation）。
 * 尽きたら `invocation: failed` を state.json に書く。502 は返さない。
 */
export async function invokeAi(options: InvokeAiOptions): Promise<void> {
  const { sessionId } = options
  const cwd = sessionDir(sessionId)
  const timeoutMs = readClaudeConfig().timeoutMs

  let mode: ClaudeMode = options.first ? 'new' : 'resume'
  let prompt = options.prompt
  const failures: string[] = []

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const outcome = await attemptOnce({ sessionId, cwd, prompt, mode, timeoutMs })

    if (outcome.kind === 'submitted') return

    failures.push(outcome.detail)
    if (outcome.sessionMissing) {
      if (!options.first) {
        // 往復の途中で継続先を失った。ここから `--session-id` で始め直すと、概要も
        // 過去のストロークも無い会話へ入力だけを流し込むことになる。
        failures.push('継続先のセッションが失われた（初回ではないので作り直さない）')
        break
      }
      // 初回。継続先が無い = 履歴には何も入っていない。送り直してよい。
      mode = 'new'
      prompt = options.prompt
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
