import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { LOG_PREFIX } from './log'

/**
 * 走っているプロセスの一覧を取る
 * （openspec/specs/bootstrap/system/cleanup-agent-process）。
 *
 * 起動時の後始末（`server/utils/stroke/reap.ts`）が、前のプロセスが残した子を argv の
 * 中身で照合するために使う。pid は記録しない——記録した pid を探す形は採らない
 * （pid は再利用されるので、殺す前に argv の照合が結局要る）。
 */

const execFileAsync = promisify(execFile)

/** 1プロセスぶんの pid と argv（`ps -o args=` が返す生の文字列）。 */
export interface LiveProcess {
  pid: number
  /** コマンドラインそのもの。フラグの解釈はここでは行わない（照合側の責務）。 */
  argv: string
}

/** `ps -ww -e -o pid=,args=` に渡す引数。設定ではない（docs/specs/core/settings-reference.md）。 */
const PS_ARGS = ['-ww', '-e', '-o', 'pid=,args='] as const

/** 出力が長大な環境でも打ち切られないように余裕を持たせる。設定ではない。 */
const MAX_BUFFER_BYTES = 16 * 1024 * 1024

/**
 * 走っているプロセスの一覧を取る。
 *
 * **取れなかったら `null` を返す。** `ps` が無い・権限が無い等の環境では例外を投げず、
 * 呼び出し側（起動時の後始末）を止めない——「判定できない」に倒れる
 * （`ps` が無い・権限が無い環境ではここが `null` になる）。
 */
export async function listLiveProcesses(): Promise<LiveProcess[] | null> {
  let stdout: string
  try {
    ({ stdout } = await execFileAsync('ps', PS_ARGS as unknown as string[], { maxBuffer: MAX_BUFFER_BYTES }))
  } catch (error) {
    console.warn(`${LOG_PREFIX} 走っているプロセスの一覧を取れない`, error)
    return null
  }
  return parsePsOutput(stdout)
}

/**
 * `ps -o pid=,args=` の出力を1行1プロセスへ分ける。
 *
 * 純粋な文字列処理として切り出してあり、`ps` を起動せずにテストできる。
 */
export function parsePsOutput(stdout: string): LiveProcess[] {
  const processes: LiveProcess[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const match = /^(\d+)\s+(.*)$/.exec(trimmed)
    if (match === null) continue
    processes.push({ pid: Number(match[1]), argv: match[2] ?? '' })
  }
  return processes
}
