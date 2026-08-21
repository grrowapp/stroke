/**
 * 本家の registry(`activeProjects.json`) を読む。
 *
 * アクティブとは registry entry の `instances` に生きた PID がある状態を指す。ただし
 * 本家の生存確認はダッシュボード起動時の1回だけで、定期実行は明示的に外されている
 * （docs/adr/0002）。stroke-board が独自に PID の生存を確認することはしない。本家が
 * registry に残しているものをそのまま「アクティブ」として扱う。
 *
 * 読むだけで書かない。
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const REGISTRY_FILE = 'activeProjects.json';

/** registry entry。本家 `ProjectRegistryEntry` に対応する */
export interface RegistryEntry {
  projectId: string;
  /** workspace のパス。`projectId` はこのパスの SHA-1 から作られる */
  projectPath: string;
  /** `.spec-workflow` の置き場。走査結果と突き合わせるのはこちら（design.md 決定1） */
  workflowRootPath: string;
  projectName: string;
  instances: { pid: number; registeredAt: string }[];
}

export type RegistryResult =
  | { status: 'ok'; entries: RegistryEntry[] }
  | { status: 'unreadable'; path: string; reason: string };

/**
 * registry を読む。
 *
 * ファイルが無い場合は「アクティブなプロジェクトが1件も無い」と等価なので、空配列を返す。
 * 読めるが壊れている場合は区別して返す。黙って空にすると、全プロジェクトが未接続に見えて
 * しまい、原因が追えなくなる。
 */
export async function readRegistry(specWorkflowHome: string): Promise<RegistryResult> {
  const path = join(specWorkflowHome, REGISTRY_FILE);

  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (error) {
    // ファイルが無いのは異常ではない。本家が一度も起動していないだけ
    if (isNotFound(error)) return { status: 'ok', entries: [] };

    return { status: 'unreadable', path, reason: toReason(error) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { status: 'unreadable', path, reason: toReason(error) };
  }

  // registry は projectId をキーにしたオブジェクト。配列ではない
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 'unreadable', path, reason: 'registry の最上位がオブジェクトではない' };
  }

  return { status: 'ok', entries: Object.values(parsed as Record<string, unknown>).filter(isRegistryEntry) };
}

/**
 * registry の要素として使える形かどうか。
 *
 * ここでは zod を使わない。registry は本家が書くファイルであって、こちらが受け取る
 * ペイロードではない。壊れた1件があっても他の行は出したいので、弾いて残りを通す。
 */
function isRegistryEntry(value: unknown): value is RegistryEntry {
  if (value === null || typeof value !== 'object') return false;

  const entry = value as Record<string, unknown>;

  return (
    typeof entry.projectId === 'string' &&
    typeof entry.projectPath === 'string' &&
    typeof entry.workflowRootPath === 'string' &&
    typeof entry.projectName === 'string' &&
    Array.isArray(entry.instances)
  );
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT';
}

function toReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
