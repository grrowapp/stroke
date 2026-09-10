/**
 * 昇格したプロジェクトを、保存先から直に読む。
 *
 * 承認はセッションディレクトリをプロジェクト名へ改名するだけなので、**プロジェクトの実体は
 * 承認した瞬間に存在している**。だが `.spec-workflow/` ができるのは後（生成（P2）の依頼を
 * 本家が受理したとき）なので、走査（`scanProjects`）はそれまで拾えない。その空白を埋めるのがここである
 * （specs/project/directory「プロジェクトの母集合を親パスの走査で作る」）。
 *
 * **phase も持ち帰る。** 行が生成中（`approved`）か完了（`activated`）かは、走査に出るか
 * どうかではなく phase で決まる（specs/project/generation「生成中か完了かはファイルシステムの
 * 事実だけで判定する」・add-activated-phase design D8）。
 *
 * **`listSessions`（`server/handler/session.ts`）に相乗りしない。** あれは巡回のための一覧で、`openspec/` の存在と
 * `config.yaml` の中身まで検査する。母集合の判定にその検査を持ち込むと、openspec が壊れた
 * プロジェクトが一覧から丸ごと消える。ここが要るのは `state.json` の `phase` だけである。
 *
 * **`invocation` を読まない。** あれは `state.json` に書かれる永続値で、時間切れの見張りは
 * プロセス内にしかない。サーバーが落ちると `running` のまま誰も戻さず、その行は永久に
 * 生成中になる。判定はファイルシステムの事実だけで行う（design.md D7）。
 *
 * 読みは `readState`（zod）に寄せる。生読みを増やさない（design D6）。`readState` が読む
 * 保存先（`projectShareRoot`）と、ここへ渡る親パス（`projectsParentPath`）は同じ値である
 * （`server/utils/config.ts`「走査の親パスだけは `projectShareRoot` を見る」）。
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { isPromotedState, readState } from '../stroke/session-store';

/** 昇格したプロジェクト1件。生成の途中（`approved`）か、完成済み（`activated`）か */
export interface PromotedProject {
  /** 承認で確定した名前。保存先直下のディレクトリ名でもある */
  name: string;
  /** 保存先直下のディレクトリの絶対パス */
  path: string;
  /** `approved` は生成中、`activated` は完成 */
  phase: 'approved' | 'activated';
}

/**
 * 昇格したプロジェクトを列挙する。
 *
 * 昇格済み（`approved` / `activated`）だけを載せる。まだ `stroking` / `proposed` の
 * セッションはプロジェクトではないので載せない。
 *
 * 読めないもの・`state.json` を持たないものは黙って飛ばす。保存先には無関係な
 * ディレクトリも並びうる。
 */
export async function listPromotedProjects(
  shareRoot: string | null,
): Promise<PromotedProject[]> {
  if (shareRoot === null) return [];

  let entries;
  try {
    entries = await readdir(shareRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const promoted: PromotedProject[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const phase = await promotedPhaseOf(entry.name);
    if (phase === null) continue;

    promoted.push({ name: entry.name, path: join(shareRoot, entry.name), phase });
  }

  return promoted;
}

/** 昇格済みならその phase。読めない・昇格していないなら null */
async function promotedPhaseOf(name: string): Promise<PromotedProject['phase'] | null> {
  try {
    const state = await readState(name);
    return isPromotedState(state) ? state.phase : null;
  } catch {
    return null;
  }
}
