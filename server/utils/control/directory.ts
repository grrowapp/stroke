/**
 * 走査結果と registry を突き合わせて、上層のプロジェクト一覧を作る。
 *
 * 突き合わせのキーは `workflowRootPath` である。registry の `projectId` は
 * `projectPath`(workspace のパス) の SHA-1 から作られるため、走査で見つかる
 * `.spec-workflow` を持つディレクトリからは計算できない（design.md 決定1）。
 */

import type { RegistryEntry } from '../upstream/registry';
import type { ScanResult } from '../upstream/scan';
import type { ProjectDirectory, ProjectSummary } from '#shared/types';

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
 * 並びはアクティブが上、未接続が下。同じ区分の中では名前順にして、走査の返り順に
 * 依存しないようにする（specs/project-directory）。
 */
export function buildProjectDirectory(
  scan: ScanResult,
  registry: RegistryLookup,
  pendingApprovals: PendingApprovalCounts = new Map(),
): ProjectDirectory {
  if (scan.status === 'not-configured') return { status: 'not-configured' };

  if (scan.status === 'unreadable') {
    return { status: 'scan-failed', parentPath: scan.parentPath, reason: scan.reason };
  }

  const activeByWorkflowRoot = indexActiveEntries(registry.entries);

  const projects: ProjectSummary[] = scan.projects.map((project) => {
    const entry = activeByWorkflowRoot.get(project.workflowRootPath);

    return {
      name: project.name,
      workflowRootPath: project.workflowRootPath,
      connection: entry === undefined ? 'disconnected' : 'active',
      projectId: entry?.projectId ?? null,
      // アクティブの実体は生きた PID なので、その値をそのまま出す
      pid: entry?.instances[0]?.pid ?? null,
      lastModified: project.lastModified,
      // 未接続では本家 API から取れない。取れなかったことと0件を混ぜない
      pendingApprovals: entry === undefined ? null : (pendingApprovals.get(entry.projectId) ?? null),
    };
  });

  projects.sort(compareProjects);

  return {
    status: 'ok',
    parentPath: scan.parentPath,
    projects,
    registryReadable: registry.readable,
  };
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

function compareProjects(a: ProjectSummary, b: ProjectSummary): number {
  if (a.connection !== b.connection) return a.connection === 'active' ? -1 : 1;
  return a.name.localeCompare(b.name);
}
