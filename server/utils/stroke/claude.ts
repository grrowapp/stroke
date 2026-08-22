import { spawn } from 'node:child_process'
import { readClaudeConfig } from './claude-config'

/** 呼び出しモード。セッションの最初だけ `--session-id`、以降は `--resume`。 */
export type ClaudeMode = 'new' | 'resume'

export interface ClaudeRunOptions {
  /** セッション uuid。ディレクトリ名と `--session-id` / `--resume` で同じものを使う */
  sessionId: string
  /** `claude -p` の cwd。AI が書く生成物はここへ落ちる */
  cwd: string
  /** prompt。`--` の後ろに位置引数として渡す */
  prompt: string
  mode: ClaudeMode
}

export type ClaudeRunResult =
  /** プロセスが成功として終わった。応答の中身はここでは扱わない（endpoint への提出が受け取り口）。 */
  | { ok: true }
  /** 失敗。`sessionMissing` は継続先のセッションが無かったことを指す */
  | { ok: false, sessionMissing: boolean, detail: string }

/** 継続しようとしたセッションが存在しないときに CLI が出す文言（実測）。 */
const SESSION_MISSING = 'No conversation found with session ID'

/**
 * `claude -p` を子プロセスとして1回だけ起動する。リトライはここでは扱わない。
 */
export async function runClaude(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  const config = readClaudeConfig()
  const args = [
    '-p',
    '--output-format',
    'json',
    // ADR 0001: project を外すとスキルがロードされない。
    '--setting-sources',
    config.settingSources,
    '--model',
    config.model,
    options.mode === 'new' ? '--session-id' : '--resume',
    options.sessionId,
  ]

  // ADR 0001: 渡すのはリポジトリのルート。grilling / domain-modeling を持つリポジトリと、
  // セッション API スキルを持つ assets とで置き場が分かれるため、空白区切りで複数受ける。
  for (const dir of config.addDir.trim().split(/\s+/).filter(d => d !== '')) {
    args.push('--add-dir', dir)
  }

  // 空なら渡さない（許可を絞りたい運用で空文字を入れられるようにしてある）。
  const allowedTools = config.allowedTools.trim()
  if (allowedTools !== '') {
    args.push('--allowedTools', allowedTools)
  }

  // `--` で option の解釈を打ち切る。以降は位置引数として届くので、`--allowedTools` の
  // ような可変長フラグの後ろに置いても飲み込まれない。フラグを増減しても影響しない。
  args.push('--', options.prompt)

  const timeoutMs = config.timeoutMs

  return await new Promise<ClaudeRunResult>((resolve) => {
    // 接続先は prompt に載せず環境変数で渡す（design.md 決定7）。セッション API スキルは
    // フェンスの事前実行から `printenv` でこの値を読む。
    const child = spawn('claude', args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, STROKE_BASEURL: config.apiBaseUrl },
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

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
        finish({ ok: false, sessionMissing: false, detail: `タイムアウト (${timeoutMs}ms)` })
        return
      }
      const missing = `${stderr}${stdout}`.includes(SESSION_MISSING)
      if (code !== 0) {
        finish({ ok: false, sessionMissing: missing, detail: stderr.trim() || `終了コード ${code}` })
        return
      }
      if (!isSuccessResult(stdout)) {
        finish({ ok: false, sessionMissing: missing, detail: '応答が成功として読み取れない' })
        return
      }
      finish({ ok: true })
    })

  })
}

/**
 * `--output-format json` の出力から、プロセスが成功として終わったかだけを見る。
 * 応答の中身（`result` フィールド）は読み取らない（specs/ai-invocation: 標準出力は
 * プロセスの成否の判定にのみ使う）。
 */
function isSuccessResult(stdout: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return false
  }
  if (typeof parsed !== 'object' || parsed === null) return false
  const envelope = parsed as Record<string, unknown>
  return envelope.type === 'result' && envelope.is_error !== true && envelope.subtype === 'success'
}
