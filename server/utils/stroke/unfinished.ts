/**
 * 中断したストローク——昇格前（`stroking` / `proposed`）のセッションを列挙する。
 *
 * **`listSessionsCore` に相乗りしない。** あれは巡回と初回判定のための一覧で、openspec ルートと
 * `config.yaml` のスキーマ設定まで検査する（`session-core.ts` の `passesListChecks`）。実行環境は
 * 初回の起動で整えられるので、**その起動が失敗し続けたセッションは、あの一覧に載らない**。
 * 完全な失敗に達して自動では動かない対象こそ戻り道が要る（`docs/specs/architecture/failure.md`
 * 「時間を置いて再開する」）以上、検査を持ち込むと、いちばん拾いたいものが落ちる。
 *
 * ここが見るのは `state.json` があることだけである。判定の形は昇格したプロジェクトの列挙
 * （`server/utils/control/creating.ts`）と揃えてある。
 */

import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { readState } from './session-store'
import type { SessionSummary } from '#shared/stroke'

const STATE_FILE = 'state.json'

/**
 * 昇格前のセッションを新しい順に返す。
 *
 * 昇格した対象（`approved` / `activated`）は**載せない**。あれはプロジェクトであり、上層の
 * プロジェクト一覧に出ている。読めないもの・`state.json` を持たないものは黙って飛ばす——
 * 保存先には無関係なディレクトリも並びうる。
 */
export async function listUnfinishedStrokes(root: string | null): Promise<SessionSummary[]> {
  if (root === null) return []

  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const sessions: SessionSummary[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    let updatedAt: string
    try {
      const state = await stat(join(root, entry.name, STATE_FILE))
      if (!state.isFile()) continue
      updatedAt = state.mtime.toISOString()
    } catch {
      continue
    }

    let state
    try {
      state = await readState(entry.name)
    } catch {
      continue
    }

    if (state.phase !== 'stroking' && state.phase !== 'proposed') continue

    sessions.push({
      id: entry.name,
      phase: state.phase,
      updatedAt,
      // キックする側がこれを cwd として U13 に渡す。endpoint に導出させない
      path: join(root, entry.name),
      invocation: state.invocation,
    })
  }

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
