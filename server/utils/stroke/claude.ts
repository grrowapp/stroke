import { spawn } from 'node:child_process'
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { LOG_PREFIX } from './log'
import { isSafeSegment } from './session-core'

/** 打ち切るときに送るシグナル。設定ではない（docs/specs/core/settings-reference.md）。 */
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
  /**
   * この起動を打ち切るまでの待ち時間。超えたら `SIGKILL` を送り、失敗として返す
   * （openspec/specs/agent/invocation「タイムアウトで failed に変える」）。
   *
   * **既定値を持たない。** 長さは設定から決まり（`claude.timeoutMs` /
   * `claude.timeoutStepMs`）、起こし直した回数を知っている呼び出し側が算出して渡す。
   * ここで既定を持つと、資料に無い設定値が core 側に戻る
   * （docs/specs/core/settings-reference.md・ADR 0004）。
   */
  timeoutMs: number
  /**
   * 呼び出しの生出力（stdout 全文）を書き残すディレクトリ。省けば書かない。
   *
   * 調査用の複製であり、書き出しの成否は呼び出しの結果に反映しない
   * （openspec/specs/debug/logging）。値は呼び出し側が設定から引いて渡す。
   */
  debugLogDir?: string
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

  // デバッグログを取るときだけ `stream-json` にする。
  //
  // `json` は最終結果1件しか出さないので、ツールの呼び出しと結果がどこにも残らない
  // （実測 2026-08-27: MCP ツールが 500 で失敗し続けていたのに、サーバー側のログにも
  // デバッグログにも痕跡が無かった）。`stream-json` は `assistant` の `tool_use` と
  // `user` の `tool_result` を1行ずつ流すので、失敗したツール呼び出しが残る。
  //
  // 判定側は無変更でよい。`stdout` は最後の塊だけを持ち（下の `data` 参照）、
  // `stream-json` の最終行は `json` と同じ `type: "result"` のエンベロープである。
  //
  // `--verbose` は `--print` と併用する `stream-json` の要件（`claude --help`）。
  const output = options.debugLogDir === undefined
    ? ['--output-format', 'json']
    : ['--output-format', 'stream-json', '--verbose']

  const args = [
    ...launch.args,
    '-p',
    ...output,
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

    /** 判定に使う塊。**最後の1つだけ**を持つ（`child.stdout.on('data')` を参照） */
    let stdout = ''
    /** ログに残す塊。届いた順に全部持つ */
    const events: string[] = []
    let stderr = ''
    let timedOut = false
    let settled = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill(CLAUDE_TIMEOUT_SIGNAL)
    }, options.timeoutMs)

    const finish = (result: ClaudeRunResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    // イベントの区切り（改行）で1塊ずつ取り出し、判定用とログ用に分けて持つ。
    //
    // `stdout` は**最後の1塊だけ**を持つ（追記ではなく上書き）。`--output-format json`
    // なら塊は1つしか来ないので今までと同じ値になり、`stream-json` なら最終行
    // （`type: "result"`）が残る。どちらでも `readEnvelope` は JSON 1件を読むだけでよく、
    // 成否の判定に手を入れずに出力形式を増やせる。
    //
    // chunk はイベントの境界で届く保証が無い。行の途中で切れた分は `pending` に残し、
    // 次の chunk と繋いでから塊にする。
    let pending = ''
    const take = (line: string): void => {
      if (line.trim() === '') return
      events.push(line)
      stdout = line
    }
    child.stdout.on('data', (chunk: string) => {
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) take(line)
    })
    // **末尾に改行が来ない場合がある。** 区切りを待っていると最後の塊を落とすので、
    // ストリームが閉じた時点で残りを取り込む（実測: 改行を付けずに終わる出力で
    // stdout が空になり、成否の判定が丸ごと壊れた）
    child.stdout.on('end', () => {
      take(pending)
      pending = ''
    })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })

    child.on('error', (error: Error) => {
      finish({ ok: false, sessionMissing: false, detail: `claude を起動できない: ${error.message}` })
    })

    child.on('close', (code: number | null) => {
      // 生出力の複製は成否の判定より先に、判定と独立に残す。失敗した呼び出しの
      // 出力こそ調査に要る（openspec/specs/debug/logging「失敗した呼び出しの出力も残る」）
      if (options.debugLogDir !== undefined) {
        // ファイル名に使う id は**出どころを問わず** isSafeSegment で通す。呼び出し側の
        // 値も、steering の継続では前回応答の session_id（`state.json` の runId）が
        // 未検証のまま流入するため、優先側だけ素通しにしない。保存先の外へ出られる形を
        // 通さない（識別子をパスに使う既存の線引きと同じ）
        const rawId = sessionId ?? readEnvelope(stdout)?.sessionId
        writeDebugLog(
          options.debugLogDir,
          rawId != null && isSafeSegment(rawId) ? rawId : 'unknown',
          formatDebugLog(events),
        )
      }
      if (timedOut) {
        finish({ ok: false, sessionMissing: false, detail: `タイムアウト (${options.timeoutMs}ms)` })
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
 * デバッグログに書く中身を組み立てる。
 *
 * **書き出しのルールをここ1箇所に閉じ込める。** 出力形式（`--output-format`）を増やすとき
 * や、ツール呼び出しの要約を足したくなったときに、触るのをこの関数だけにするための口である。
 *
 * 今は届いた塊をそのまま繋ぐ。`--output-format json` なら塊は1つで、これまでと同じ
 * 「生の stdout がそのまま1件」になる。加工して情報を捨てるより、まず生を残す。
 *
 * **末尾に改行を足さない。** 足すと生出力と1文字違いになり、書き残したものを元の出力と
 * 突き合わせられなくなる。呼び出しの区切りとしての改行は `writeDebugLog` 側で付ける。
 */
function formatDebugLog(events: string[]): string {
  return events.join('\n')
}

/**
 * セッションごとに1ファイルへ追記する。
 *
 * **調べる単位はセッションである。** 呼び出しごとにファイルを分けると、1本の往復を追うのに
 * 何枚も開いて時刻で並べ直すことになり、並走したセッションのファイルとも混ざる
 * （実測 2026-08-28: 3往復で4ファイル）。
 *
 * 追記なので、前の呼び出しの記録は失われない。区切りは見出し行で示し、何回目かが分かるよう
 * にする（`debug/logging` の「呼び出しの区切りが分かる」）。
 */
function writeDebugLog(dir: string, sessionId: string, stdout: string): void {
  const file = join(dir, `${sessionId}.json`)
  void mkdir(dir, { recursive: true })
    // `a` = 追記。ファイルが無ければ作る
    .then(() => appendFile(file, `${debugLogEntry(new Date(), stdout)}\n`))
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error)
      console.warn(`${LOG_PREFIX} デバッグログを書けない: ${file}（${detail}）`)
    })
}

/**
 * 1回の呼び出しぶんの記録。見出し行で区切る。
 *
 * 見出しは `#` で始める行にして、中身（1行1イベントの JSON）と混ざらないようにする。
 * `grep -n '^# '` で呼び出しの頭だけを拾える。
 */
function debugLogEntry(now: Date, stdout: string): string {
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`
  return `# ${date} ${time}\n${stdout}`
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
