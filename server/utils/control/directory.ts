/**
 * 走査結果と registry を突き合わせて、上層のプロジェクト一覧を作る。
 *
 * 突き合わせのキーは `workflowRootPath` である。registry の `projectId` は
 * `projectPath`(workspace のパス) から作られるため、走査で見つかる `.spec-workflow` を
 * 持つディレクトリからは一般には計算できない（design.md 決定1）——外から置かれた
 * プロジェクトでは workspace のパスが分からないためである。
 *
 * **自分で作ったものだけは導ける。** 承認で昇格したプロジェクトは、MCP へ渡した cwd が
 * そのまま workspace になり、それは `<projectShareRoot>/<name>` に等しい。生成中の行に
 * 限って `projectId` を導出しているのはそのためである（`upstream/project-id.ts`）。
 */

import type { RegistryEntry } from '../upstream/registry';
import type { ScanResult } from '../upstream/scan';
import { deriveProjectId } from '../upstream/project-id';
import type { PromotedProject } from './creating';
import type { ProjectCreation, ProjectDirectory, ProjectSummary } from '#shared/types';

export interface RegistryLookup {
  entries: RegistryEntry[];
  /** registry が読めたか。読めなくても一覧は出す（全件が未接続として並ぶ） */
  readable: boolean;
}

/**
 * projectId ごとの保留中の承認依頼の件数。取れなかったプロジェクトは持たない。
 * 未接続のプロジェクトは本家 API から取れないので、そもそも問い合わせない。
 */
export type PendingApprovalCounts = ReadonlyMap<string, number>;

/**
 * 一覧を組み立てる。
 *
 * 並びはアクティブが上、未接続が下、生成中が最下部。同じ区分の中では名前順にして、
 * 走査の返り順に依存しないようにする（specs/project/directory）。
 *
 * **走査は母集合を作るだけで、行が生成中か完了かは決めない。** それは昇格の記録
 * （`promoted`）の phase が決める——`approved` は生成中、`activated` は完了。走査に出ている
 * （`.spec-workflow/` が在る）ことを完了の根拠にしない。そのディレクトリは本家 MCP が接続した
 * 瞬間にでき、成果物が1つも無いうちからできている（specs/project/generation・
 * add-activated-phase design D8）。
 *
 * 昇格したプロジェクトは走査と**ディレクトリ名**で突き合わせる。承認した直後は
 * `.spec-workflow` を持たないため `workflowRootPath` が定まらず、走査側のキーが使えない
 * （design.md D1）。
 */
export function buildProjectDirectory(
  scan: ScanResult,
  registry: RegistryLookup,
  pendingApprovals: PendingApprovalCounts = new Map(),
  promoted: readonly PromotedProject[] = [],
): ProjectDirectory {
  if (scan.status === 'not-configured') return { status: 'not-configured' };

  if (scan.status === 'unreadable') {
    return { status: 'scan-failed', parentPath: scan.parentPath, reason: scan.reason };
  }

  const activeByWorkflowRoot = indexActiveEntries(registry.entries);
  const promotedByName = new Map(promoted.map((entry) => [entry.name, entry]));

  const projects: ProjectSummary[] = scan.projects.map((project) => {
    // 昇格の記録は突き合わせたら落とす。**承認で作ったものかどうか**と**生成中かどうか**は、
    // 落とす前のここでしか分からない
    const promotedHere = promotedByName.get(project.name);
    promotedByName.delete(project.name);

    // 生成中（`approved`）の行は、走査に出ていても registry に載っていても生成中のまま。
    // 接続の判定に掛けない——掛けると成果物が無いまま入場できる行になる
    // （specs/project/directory「アクティブと未接続を判定して示す」）
    if (promotedHere?.phase === 'approved') {
      return unfinished(project.name, project.workflowRootPath);
    }

    const entry = activeByWorkflowRoot.get(project.workflowRootPath);

    return {
      name: project.name,
      workflowRootPath: project.workflowRootPath,
      connection: entry === undefined ? 'disconnected' : 'active',
      creation: 'done',
      // registry から引けないとき、**承認で作ったものに限って**導出で埋める。決着の直後は
      // 本家がまだ起動しておらず registry に載っていないので、そこで null にすると承認画面を
      // 開く選択肢が選べなくなる（specs/project/generation）。
      //
      // **外から置かれたプロジェクトには導出しない。** workspace のパスが分からず、導出値は
      // 本家の id と別物になる（design.md D13）。null のままにして「本家に載っていない」ことを
      // 保つ——`enter()` と `unread()` はその null を見ている
      projectId:
        entry?.projectId ?? (promotedHere !== undefined ? deriveProjectId(project.workflowRootPath) : null),
      // アクティブの実体は生きた PID なので、その値をそのまま出す
      pid: entry?.instances[0]?.pid ?? null,
      lastModified: project.lastModified,
      // 未接続では本家 API から取れない。取れなかったことと0件を混ぜない
      pendingApprovals: entry === undefined ? null : (pendingApprovals.get(entry.projectId) ?? null),
    };
  });

  // 走査に出てこなかった昇格分＝`.spec-workflow/` がまだ無い。承認した直後はここに落ちる。
  // 完成の記録（`activated`）が在るのに走査に出ないことは起こりえない（承認依頼が在れば
  // `.spec-workflow/` も在る）。起きたら完了・未接続として出す（design D8）
  for (const entry of promotedByName.values()) {
    projects.push(entry.phase === 'approved' ? unfinished(entry.name, entry.path) : completedUnscanned(entry.name, entry.path));
  }

  projects.sort(compareProjects);

  return {
    status: 'ok',
    parentPath: scan.parentPath,
    projects,
    registryReadable: registry.readable,
  };
}

/**
 * 生成中の行。本家から来る値は持たず、接続の判定の対象にもしない
 * （specs/project/directory「アクティブと未接続を判定して示す」）。本家に載っていても
 * `active` にしない——`connection` が `disconnected` であることが入場のガードの根拠である。
 *
 * **`projectId` だけは導出して入れる。** 破棄のリクエストは `projectId` で組むが
 * （`DELETE /api/projects/:projectId`）、registry には載っていないことがある。本家と同じ式で
 * workspace のパスから作る（`upstream/project-id.ts`）。画面は受け取った値を使うだけで、
 * id の作り方を知らない。
 */
function unfinished(name: string, workflowRootPath: string): ProjectSummary {
  return {
    name,
    workflowRootPath,
    connection: 'disconnected',
    creation: 'in-progress',
    projectId: deriveProjectId(workflowRootPath),
    pid: null,
    // 走査で拾えても埋めない。生成中に本家の値を見せない
    lastModified: null,
    pendingApprovals: null,
  };
}

/** 完成の記録は在るが走査に出ない行。起こりえないが、落とさずに完了・未接続として出す */
function completedUnscanned(name: string, workflowRootPath: string): ProjectSummary {
  return { ...unfinished(name, workflowRootPath), creation: 'done' };
}

/**
 * `workflowRootPath` から registry entry を引けるようにする。
 *
 * アクティブとは `instances` が空でないこと。本家の生存確認はダッシュボード起動時の
 * 1回だけなので、stroke-board が独自に PID を確認することはしない（docs/adr/0006）。
 *
 * `SPEC_WORKFLOW_SHARED_ROOT` を使った worktree 共有では、複数の workspace が1つの
 * `workflowRootPath` を共有しうる。`.spec-workflow` の中身は同一なのでどれを使っても
 * 読める内容は変わらない。先頭の entry を採る（design.md 決定1）。
 */
function indexActiveEntries(entries: RegistryEntry[]): Map<string, RegistryEntry> {
  const index = new Map<string, RegistryEntry>();

  for (const entry of entries) {
    if (entry.instances.length === 0) continue;
    if (index.has(entry.workflowRootPath)) continue;

    index.set(entry.workflowRootPath, entry);
  }

  return index;
}

/**
 * アクティブ → 未接続 → 生成中 の順。同じ区分の中は名前順。
 *
 * 生成中を最下部に置くのは、まだ入れないものであり、既に在るプロジェクトの並びを
 * 乱さないためである（specs/project/directory）。
 */
function compareProjects(a: ProjectSummary, b: ProjectSummary): number {
  const rankA = rankOf(a);
  const rankB = rankOf(b);
  if (rankA !== rankB) return rankA - rankB;
  return a.name.localeCompare(b.name);
}

function rankOf(project: ProjectSummary): number {
  if (project.creation !== 'done') return 2;
  return project.connection === 'active' ? 0 : 1;
}
