import { spawn } from 'node:child_process'

/**
 * 子プロセスを打ち切るまでの待ち時間。超えたらリトライ経路へ流す。
 * 起動後この時間内に endpoint への提出が無ければ、その呼び出しは失敗として扱う
 * （openspec/specs/agent/invocation）。設定ではない
 * （docs/specs/core/settings-reference.md）。
 *
 * **10分。** 180秒では初回が必ず時間切れになった（実測 2026-08-25）。claude は
 * スキルをロードし、`/get-overview` で概要を取り、最初の問いを組み立てるまでに
 * それ以上かかる。巡回が拾って2回目で通っていたが、ユーザーは最初の問いが出るまで
 * 4分以上待たされていた。
 */
export const CLAUDE_TIMEOUT_MS = 600000

/** 打ち切るときに送るシグナル。 */
const CLAUDE_TIMEOUT_SIGNAL = 'SIGKILL' as const

/**
 * 継続しようとしたセッションが存在しないときに `claude` が出す文言（実測）。
 * こちらが出すメッセージではなく、子プロセスの stdout/stderr に対する照合文字列である。
 * CLI 側が文言を変えたらここを追随させる。
 */
const CLAUDE_SESSION_MISSING_MESSAGE = 'No conversation found with session ID'

/** 呼び出しモード。セッションの最初だけ `--session-id`、以降は `--resume`。 */
export type ClaudeMode = 'new' | 'resume'

/**
 * `claude` の起動定義。実行ファイルと、呼び出しに依らないフラグ一式。
 *
 * 出どころは `runtimeConfig.claude`（docs/specs/core/settings-reference.md）だが、
 * 引くのは呼び出し側である。`--mcp-config` のように用途ごとに要るフラグは、
 * 呼び出し側が `args` の後ろに足して渡す。ここでは解釈も補正もしない。
 */
export interface ClaudeLaunch {
  command: string
  args: readonly string[]
  /**
   * 子プロセスへ `STROKE_BASEURL` として渡すエージェント向け endpoint の base URL。
   * prompt には載せない（design.md 決定7）
   */
  apiBaseUrl: string
}

export interface ClaudeRunOptions {
  /**
   * 会話 id。`mode: 'new'` で与えれば `--session-id`、`mode: 'resume'` なら `--resume`。
   *
   * `mode: 'new'` で**省けば claude が自分で採番する**。その値は output stream の
   * `session_id` として返るので、続きが要る用途はそれを覚えて次に渡す。
   *
   * ストロークは自前採番の uuid を渡す。スキルが `${CLAUDE_SESSION_ID}` でセッション id を
   * 知る前提（docs/specs/architecture/session-workflow.md の実測記録）に効いているため、
   * ここを claude 任せにできない。
   */
  sessionId?: string
  /** 起動定義。呼び出し側が設定から引いて渡す */
  launch: ClaudeLaunch
  /** `claude -p` の cwd。AI が書く生成物はここへ落ちる */
  cwd: string
  /** prompt。`--` の後ろに位置引数として渡す */
  prompt: string
  mode: ClaudeMode
}

export type ClaudeRunResult =
  /**
   * プロセスが成功として終わった。**これが完了の検知である**
   * （openspec/specs/agent/invocation「完了は output stream で検知して idle に変える」）。
   * `sessionId` は output stream の `session_id`。続きが要る用途はこれを覚える。
   */
  | { ok: true, sessionId: string | null }
  /** 失敗。`sessionMissing` は継続先のセッションが無かったことを指す */
  | { ok: false, sessionMissing: boolean, detail: string }

/**
 * `claude -p` を子プロセスとして1回だけ起動する。リトライはここでは扱わない。
 */
export async function runClaude(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  // 起動定義は呼び出し側が渡す。ここでは設定を引かず、渡されたフラグを解釈も補正も
  // しない（openspec/specs/agent/invocation）。足すのは**呼び出しごとに決まる分だけ**で、
  // 出力形式と、セッション id と、prompt の3つである。
  const { launch, sessionId, mode } = options

  // 会話 id は与えられたときだけ付ける。`new` で省けば claude が自分で採番し、
  // その値は output stream の `session_id` として返る。
  const conversation = sessionId === undefined
    ? []
    : [mode === 'new' ? '--session-id' : '--resume', sessionId]

  const args = [
    ...launch.args,
    '-p',
    '--output-format',
    'json',
    ...conversation,
    // `--` で option の解釈を打ち切る。以降は位置引数として届くので、`--allowedTools` の
    // ような可変長フラグの後ろに置いても飲み込まれない。フラグを増減しても影響しない。
    '--',
    options.prompt,
  ]

  return await new Promise<ClaudeRunResult>((resolve) => {
    // 接続先は prompt に載せず環境変数で渡す（design.md 決定7）。セッション API スキルは
    // フェンスの事前実行から `printenv` でこの値を読む。
    const child = spawn(launch.command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, 'STROKE_BASEURL': launch.apiBaseUrl },
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill(CLAUDE_TIMEOUT_SIGNAL)
    }, CLAUDE_TIMEOUT_MS)

    const finish = (result: ClaudeRunResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })

    child.on('error', (error: Error) => {
      finish({ ok: false, sessionMissing: false, detail: `claude を起動できない: ${error.message}` })
    })

    child.on('close', (code: number | null) => {
      if (timedOut) {
        finish({ ok: false, sessionMissing: false, detail: `タイムアウト (${CLAUDE_TIMEOUT_MS}ms)` })
        return
      }
      const missing = `${stderr}${stdout}`.includes(CLAUDE_SESSION_MISSING_MESSAGE)
      if (code !== 0) {
        finish({ ok: false, sessionMissing: missing, detail: stderr.trim() || `終了コード ${code}` })
        return
      }
      const envelope = readEnvelope(stdout)
      if (envelope === null) {
        finish({ ok: false, sessionMissing: missing, detail: '応答が成功として読み取れない' })
        return
      }
      finish({ ok: true, sessionId: envelope.sessionId })
    })

  })
}

/**
 * `--output-format json` の出力（= output stream）を読む。
 *
 * 見るのはプロセスが成功として終わったかと、会話 id だけである。応答の中身
 * （`result` フィールド）は読み取らない。**この成功が完了の検知である**
 * （openspec/specs/agent/invocation「完了は output stream で検知して idle に変える」）。
 *
 * @returns 成功なら会話 id 付き、そうでなければ null
 */
function readEnvelope(stdout: string): { sessionId: string | null } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const envelope = parsed as Record<string, unknown>
  const ok = envelope.type === 'result' && envelope.is_error !== true && envelope.subtype === 'success'
  if (!ok) return null
  return { sessionId: typeof envelope.session_id === 'string' ? envelope.session_id : null }
}
