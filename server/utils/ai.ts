import type { AiOutcome } from './apply-outcome'
import { parseProjectName, parseQuestionResult } from './ai-response'
import { runClaude, type ClaudeMode } from './claude'
import { sessionDir } from './paths'
import { continuePrompt } from './prompt'
import { readProposal, readProposalStamp } from './session-store'

export interface InvokeAiOptions {
  sessionId: string
  /** 最初の呼び出しで渡すプロンプト。リトライでは送り直さない */
  prompt: string
  /** セッションの最初の呼び出しか。true なら `--session-id`、false なら `--resume` */
  first: boolean
}

/** リトライ回数。MVP の割り切りで設定値にしない。 */
const MAX_RETRIES = 2

/**
 * AI を呼び、規定の構造として読み取れるものが得られるまでリトライする。
 *
 * 得られるものは2つに1つ。標準出力から問いが読み取れれば問い、読み取れず `proposal.md` が
 * 新しくなっていれば proposal。どちらでもなければ、その呼び出しは失敗として扱う。
 * 画面に出ない説明が回答の前提になってはならないため、構造で受け取れなかった応答を
 * 問いとして提示することはない（specs/stroke-session）。
 *
 * - 失敗・タイムアウト・読み取れない、はどれも同じ経路に流す。
 * - 失敗した往復も AI 側の履歴に残るため、リトライでは入力を送り直さず続きを促す。
 * - 最初の呼び出し（`--session-id`）が失敗したときは、履歴に入っている可能性があるので
 *   まず `--resume` で継続を試み、セッションが無かったときだけ `--session-id` でやり直す。
 * - 回復した失敗は呼び出し側へ返さない。尽きたときだけ 502。
 */
export async function invokeAi(options: InvokeAiOptions): Promise<AiOutcome> {
  const { sessionId } = options
  const cwd = sessionDir(sessionId)

  let mode: ClaudeMode = options.first ? 'new' : 'resume'
  let prompt = options.prompt
  const failures: string[] = []

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    // 呼び出しのたびに取り直す。リトライの前の試行で書かれていることがある。
    const before = await readProposalStamp(sessionId)
    const run = await runClaude({ sessionId, cwd, prompt, mode })

    if (run.ok) {
      const outcome = await readOutcome(sessionId, run.result, before)
      if (outcome) return outcome

      failures.push('応答を規定の構造として読み取れない')
      mode = 'resume'
      prompt = continuePrompt()
      continue
    }

    failures.push(run.detail)
    if (run.sessionMissing) {
      if (!options.first) {
        // 往復の途中で継続先を失った。ここから `--session-id` で始め直すと、概要も
        // 過去のストロークも無い会話へ入力だけを流し込むことになる。
        failures.push('継続先のセッションが失われた（初回ではないので作り直さない）')
        break
      }
      // 初回。継続先が無い = 履歴には何も入っていない。送り直してよい。
      mode = 'new'
      prompt = options.prompt
    } else {
      mode = 'resume'
      prompt = continuePrompt()
    }
  }

  console.warn(`[stroke-board] AI 呼び出しが失敗: ${sessionId}`, failures)
  throw createError({
    statusCode: 502,
    statusMessage: 'Bad Gateway',
    message: 'AI から応答が得られなかった。同じ操作をもう一度試せる。',
    data: { attempts: failures },
  })
}

/**
 * 1回の呼び出しから得られたものを読み取る。得られなければ null。
 *
 * 問いを先に見る。proposal は `proposal.md` が新しくなったことで判定するため、
 * 問いを返しつつ過去の proposal がそのまま残っている場合と取り違えない。
 */
async function readOutcome(
  sessionId: string,
  result: string,
  before: number | null,
): Promise<AiOutcome | null> {
  const question = parseQuestionResult(result)
  if (question) return { kind: 'question', question }

  const after = await readProposalStamp(sessionId)
  if (after === null || after === before) return null

  const proposal = await readProposal(sessionId)
  if (proposal === undefined || proposal.trim() === '') return null

  const projectName = parseProjectName(result)
  return {
    kind: 'proposal',
    proposal,
    ...(projectName ? { projectName } : {}),
  }
}
