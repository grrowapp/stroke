import type { Invocation, SessionSummary } from '#shared/stroke'
import { LOG_PREFIX } from './log'
import type { LiveProcess } from './live-processes'
import { matchesTarget, type ReapTarget } from './reap-match'

/**
 * 起動時の後始末（openspec/specs/bootstrap/system/cleanup-agent-process）。
 *
 * `running` として残っている対象それぞれについて、前のプロセスが起こした claude がまだ
 * 走っていないかを argv の照合（`reap-match.ts`）で確かめ、**終了させてから**記録を倒す。
 * 起こし直す時点で重なる相手が居なくなるので、同じ会話に2本目が並ばない。
 *
 * **どのサーバーインスタンスが起こしたかは見ない。** 同じ保存先を複数のインスタンスで
 * 共有する前提を置かないため（proposal「この change で扱わないもの」）。
 *
 * `server/plugins/01.reap-running.ts` から Nitro の `$fetch` / `readStrokeConfig` を
 * 渡して呼ばれる。ここでは Nitro を知らない——依存を引数で受け取ることで、Nitro の外
 * （vitest）から判定を確かめられるようにしてある（`sweep.ts` と同じ理由）。
 */

/** シグナルは既存のタイムアウトと同じ `SIGKILL`。設定ではない。 */
const REAP_KILL_SIGNAL = 'SIGKILL' as const

/** 終了を確かめる間隔と回数。設定ではない。SIGKILL は通常すぐ効くので合計でも数秒に収まる。 */
const TERMINATION_POLL_INTERVAL_MS = 50
const TERMINATION_POLL_ATTEMPTS = 100

/** `reapRunning` が要る依存。実体は `server/plugins/01.reap-running.ts` が組み立てる。 */
export interface ReapDeps {
  /** 走っているプロセスの一覧。取れなければ `null`（`live-processes.ts`）。 */
  listProcesses: () => Promise<LiveProcess[] | null>
  /**
   * pid を `SIGKILL` で終了させ、終了したことを確かめて `true` を返す。
   * 止められなかった／確かめられなかったら `false`。
   */
  terminate: (pid: number) => Promise<boolean>
  /** `invocation` を書く。A8（`POST /api/strokes/:id/submission`）を通す関数を渡す。 */
  writeInvocation: (sessionId: string, invocation: Invocation) => Promise<void>
}

/** 後始末の結果。`server/plugins/01.reap-running.ts` がログへ出す。 */
export interface ReapCounts {
  /** SIGKILL で実際に終了させた件数 */
  killed: number
  /** `failed` を書いた件数（止めてから倒した分・すでに走っていなかった分の両方を含む） */
  failed: number
  /** `error` を書いた件数（止められなかった・判定できなかった） */
  errored: number
}

const EMPTY_COUNTS: ReapCounts = { killed: 0, failed: 0, errored: 0 }

/**
 * `running` の対象を後始末する。
 *
 * 対象ごとの分岐は次の3つ。
 *
 * 1. 判定できない（一覧を取れない・対象の種別が `unknown` で組み立てられない） → `error`。
 *    殺せたことを確かめられない以上、起こし直すと2本目が並びうるので自動では起こさない
 * 2. 走っているプロセスが1つも対象に一致しない → もう走っていない → `failed`
 * 3. 対象に一致するプロセスがある → 終了させてから `failed`。終了させられなければ `error`
 */
export async function reapRunning(sessions: readonly SessionSummary[], deps: ReapDeps): Promise<ReapCounts> {
  const running = sessions.filter(s => s.invocation === 'running')
  if (running.length === 0) return EMPTY_COUNTS

  const processes = await deps.listProcesses()

  const counts: ReapCounts = { killed: 0, failed: 0, errored: 0 }

  for (const session of running) {
    const target = targetOf(session)

    if (processes === null || target === undefined) {
      // 走っているものを調べられない。殺せない以上、起こし直すと2本目が並びうる。
      await deps.writeInvocation(session.id, 'error')
      counts.errored += 1
      continue
    }

    const match = processes.find(p => matchesTarget(p.argv, target))

    if (match === undefined) {
      // 対象に一致する claude はどこにも走っていない。安全に倒せる
      // （生きているプロセスを1つも殺していないため）。
      await deps.writeInvocation(session.id, 'failed')
      counts.failed += 1
      continue
    }

    const terminated = await deps.terminate(match.pid)
    if (!terminated) {
      await deps.writeInvocation(session.id, 'error')
      counts.errored += 1
      continue
    }

    await deps.writeInvocation(session.id, 'failed')
    counts.killed += 1
    counts.failed += 1
  }

  return counts
}

/** `SessionSummary` から照合対象を組み立てる。`phase` が `unknown` なら判定できない。 */
function targetOf(session: SessionSummary): ReapTarget | undefined {
  if (session.phase === 'approved') return { kind: 'steering', cwd: session.path }
  if (session.phase === 'stroking' || session.phase === 'proposed') {
    return { kind: 'stroke', sessionId: session.id }
  }
  return undefined
}

/**
 * pid を `SIGKILL` で終了させ、終了したことを確かめる。
 *
 * `runClaude` のタイムアウトが使うシグナルと同じ。**確かめてから `failed` を書く**
 * （openspec/specs/bootstrap/system/cleanup-agent-process の Requirement「走っている
 * claude を終了させてから記録を畳む」）——signal を送っただけでは、まだ終了処理の途中の
 * claude が MCP を呼んで記録を上書きし得る。
 */
export async function terminateProcess(pid: number): Promise<boolean> {
  try {
    process.kill(pid, REAP_KILL_SIGNAL)
  } catch (error) {
    // 対象はもう無い（signal を送る前に終わっていた）。終了したのと同じ扱いにする
    if (isNoSuchProcess(error)) return true
    console.warn(`${LOG_PREFIX} 後始末: pid ${pid} に SIGKILL を送れない`, error)
    return false
  }
  return await confirmTerminated(pid)
}

async function confirmTerminated(pid: number): Promise<boolean> {
  for (let attempt = 0; attempt < TERMINATION_POLL_ATTEMPTS; attempt += 1) {
    if (!isAlive(pid)) return true
    await sleep(TERMINATION_POLL_INTERVAL_MS)
  }
  return !isAlive(pid)
}

/** signal 0 は送らずに存在だけを確かめる（Node の慣用）。 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // ESRCH（対象が無い）以外（例: EPERM）は「確かめられない」を「まだ在る」側に倒す。
    // 判断がつかないものを止められた側へ倒さない。
    return !isNoSuchProcess(error)
  }
}

function isNoSuchProcess(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ESRCH'
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
