/**
 * 昇格したプロジェクトを、保存先から直に読む。
 *
 * 承認はセッションディレクトリをプロジェクト名へ改名するだけなので、**プロジェクトの実体は
 * 承認した瞬間に存在している**。だが `.spec-workflow/` を作るのは後から走る steering なので、
 * 走査（`scanProjects`）はそれまで拾えない。その空白を埋めるのがここである
 * （specs/project/directory「プロジェクトの母集合を親パスの走査で作る」）。
 *
 * **`listSessionsCore` に相乗りしない。** あれは巡回のための一覧で、`openspec/` の存在と
 * `config.yaml` の中身まで検査する。母集合の判定にその検査を持ち込むと、openspec が壊れた
 * プロジェクトが一覧から丸ごと消える。ここが要るのは `state.json` の `phase` だけである。
 *
 * **`invocation` を読まない。** あれは `state.json` に書かれる永続値で、時間切れの見張りは
 * プロセス内にしかない。サーバーが落ちると `running` のまま誰も戻さず、その行は永久に
 * 生成中になる。判定はファイルシステムの事実だけで行う（design.md D7）。
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 昇格したプロジェクト1件。生成の途中かもしれないし、終わっているかもしれない */
export interface PromotedProject {
  /** 承認で確定した名前。保存先直下のディレクトリ名でもある */
  name: string;
  /** 保存先直下のディレクトリの絶対パス */
  path: string;
}

const STATE_FILE = 'state.json';

/**
 * 昇格したプロジェクトを列挙する。
 *
 * `phase === 'approved'` が「昇格した」ことを表す。まだ `stroking` / `proposed` の
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

    const path = join(shareRoot, entry.name);
    if (!(await isApproved(path))) continue;

    promoted.push({ name: entry.name, path });
  }

  return promoted;
}

/** `state.json` の `phase` が `approved` か。読めなければ false */
async function isApproved(directoryPath: string): Promise<boolean> {
  try {
    const raw = JSON.parse(await readFile(join(directoryPath, STATE_FILE), 'utf8'));
    return raw?.phase === 'approved';
  } catch {
    return false;
  }
}
