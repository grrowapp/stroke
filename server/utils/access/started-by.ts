import { readFile } from 'node:fs/promises'
import { isPhase, type Phase } from '#shared/stroke'
import { SESSION_FILES, isSafeSegment, sessionFile } from '../stroke/paths'

/**
 * `state.json` から phase と始めた利用者（`startedBy`）だけを読む（design D8）。
 *
 * 判定のたびに読むので、zod を通す `readState`（配信を import する）を持ち込まず軽く読む。
 * `startedBy` を持たない既存の `state.json` は null と読む——管理者にだけ見える。
 *
 * 読めない・形が崩れている・id が保存先の外を指すものは null を返す。
 */
export async function readStartedBy(
  root: string,
  sessionId: string,
): Promise<{ phase: Phase; startedBy: string | null } | null> {
  if (!isSafeSegment(sessionId)) return null
  try {
    const raw = JSON.parse(await readFile(sessionFile(root, sessionId, SESSION_FILES.state), 'utf8'))
    const phase: unknown = raw?.phase
    if (!isPhase(phase)) return null
    const startedBy: unknown = raw?.startedBy
    return { phase, startedBy: typeof startedBy === 'string' && startedBy.length > 0 ? startedBy.toLowerCase() : null }
  } catch {
    return null
  }
}
