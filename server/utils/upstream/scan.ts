/**
 * 監視対象プロジェクトの母集合を作る。
 *
 * 本家 API はプロジェクト一覧の母集合にできない。`cleanupStaleProjects()` が生きた
 * instance の無いエントリを registry ごと削除するため、停止中のプロジェクトを知る手段が
 * 無いからである（docs/adr/0002）。そこで設定された親パスの直下を走査し、
 * `.spec-workflow` を持つディレクトリをプロジェクトとして拾う。
 *
 * ここで見つかるディレクトリは registry でいう `workflowRootPath` にあたる。
 * registry の `projectId` は `projectPath`(workspace のパス) の SHA-1 から作られるため、
 * 走査結果から `projectId` は計算できない（design.md 決定1）。
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SPEC_WORKFLOW_DIR = '.spec-workflow';

/** 走査で見つかった1プロジェクト */
export interface ScannedProject {
  /** 走査で見つかったディレクトリ名。一覧の表示名に使う */
  name: string;
  /** `.spec-workflow` を持つディレクトリの絶対パス。registry の `workflowRootPath` にあたる */
  workflowRootPath: string;
  /**
   * `.spec-workflow` 配下の直下エントリで一番新しい更新時刻（ISO8601）。取れなければ null。
   *
   * 未接続のプロジェクトについては、本家 API から何も取れないためこれが唯一の手がかりになる。
   * ファイルシステムを直接読んだ値であって、本家の情報を組み替えたものではない
   * （docs/adr/0001）。
   *
   * 限界: `specs/` `approvals/` `steering/` の各ディレクトリの mtime を見ているため、
   * 中のファイルを書き換えただけでは動かない。エントリの増減で動く。
   */
  lastModified: string | null;
}

/** `.spec-workflow` 直下のうち、更新時刻を見るディレクトリ */
const WATCHED_ENTRIES = ['specs', 'approvals', 'steering'];

/**
 * 走査の結果。
 *
 * 「親パスが未設定」「親パスが読めない」「0件」は呼び出し側が区別できなければならない
 * （specs/project-directory）。同じ空配列で返すとその区別が消えるので、判別可能な
 * union で返す。
 */
export type ScanResult =
  | { status: 'not-configured' }
  | { status: 'unreadable'; parentPath: string; reason: string }
  | { status: 'ok'; parentPath: string; projects: ScannedProject[] };

/**
 * 親パスの直下1階層だけを走査する。
 *
 * 深さを1階層に限るのは、実測した配置が `<親パス>/<name>/.spec-workflow` だからである。
 * 再帰的に潜ると無関係なディレクトリを拾う。
 */
export async function scanProjects(parentPath: string | null): Promise<ScanResult> {
  if (parentPath === null) {
    return { status: 'not-configured' };
  }

  let entries;
  try {
    entries = await readdir(parentPath, { withFileTypes: true });
  } catch (error) {
    return {
      status: 'unreadable',
      parentPath,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const projects: ScannedProject[] = [];

  for (const entry of entries) {
    // シンボリックリンク先がディレクトリの場合も拾う
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

    const workflowRootPath = join(parentPath, entry.name);

    if (await hasSpecWorkflow(workflowRootPath)) {
      projects.push({
        name: entry.name,
        workflowRootPath,
        lastModified: await latestChange(workflowRootPath),
      });
    }
  }

  return { status: 'ok', parentPath, projects };
}

/** `.spec-workflow` ディレクトリを持つかどうか。読み取りのみで、作らない */
async function hasSpecWorkflow(directoryPath: string): Promise<boolean> {
  try {
    await readdir(join(directoryPath, SPEC_WORKFLOW_DIR));
    return true;
  } catch {
    return false;
  }
}

/** 監視対象ディレクトリのうち一番新しい mtime。1つも取れなければ null */
async function latestChange(workflowRootPath: string): Promise<string | null> {
  const specWorkflow = join(workflowRootPath, SPEC_WORKFLOW_DIR);

  const times = await Promise.all(
    [specWorkflow, ...WATCHED_ENTRIES.map((entry) => join(specWorkflow, entry))].map(
      async (path) => {
        try {
          return (await stat(path)).mtimeMs;
        } catch {
          return null;
        }
      },
    ),
  );

  const known = times.filter((time): time is number => time !== null);
  return known.length === 0 ? null : new Date(Math.max(...known)).toISOString();
}
