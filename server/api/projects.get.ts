/**
 * 上層のプロジェクト一覧。
 *
 * ブラウザはここだけを見る。本家へは触らせない（structure.md の Module Boundaries）。
 * 走査も本家への問い合わせも、画面が要求したときに行う。定期実行しない
 * （tech.md の Performance Requirements）。
 */

import { defineEventHandler } from 'h3';

import { readServerConfig } from '../utils/config';
import { resolveDirectoryActions } from '../utils/control/actions';
import { buildProjectDirectory } from '../utils/control/directory';
import { readRegistry, type RegistryEntry } from '../utils/upstream/registry';
import { UpstreamRestClient } from '../utils/upstream/rest';
import { scanProjects } from '../utils/upstream/scan';
import type { ProjectDirectoryResponse } from '#shared/types';

export default defineEventHandler(async (): Promise<ProjectDirectoryResponse> => {
  const config = readServerConfig();

  const [scan, registry] = await Promise.all([
    scanProjects(config.projectsParentPath),
    readRegistry(config.specWorkflowHome),
  ]);

  const entries = registry.status === 'ok' ? registry.entries : [];

  return {
    directory: buildProjectDirectory(
      scan,
      { entries, readable: registry.status === 'ok' },
      await countPendingApprovals(config.upstreamBaseUrl, entries),
    ),
    actions: resolveDirectoryActions(),
  };
});

/**
 * 保留中の承認依頼の件数を、アクティブなプロジェクトぶんだけ数える。
 *
 * 通知（＝接続後に起きた変化）とは別物である。通知は接続直後には1件も無いが、承認待ちは
 * その時点で既に起きている。見に行かずに気づくのがこのプロダクトの目的なので、今の状態も
 * 出す（product.md の Purpose）。
 *
 * 本家が返す配列を数えているだけで、意味づけを足していない（docs/adr/0005）。
 * 取れなかったプロジェクトは持たない。0件と混ぜない。
 */
async function countPendingApprovals(
  upstreamBaseUrl: string | null,
  entries: RegistryEntry[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (upstreamBaseUrl === null) return counts;

  const client = new UpstreamRestClient(upstreamBaseUrl);
  const active = entries.filter((entry) => entry.instances.length > 0);

  await Promise.all(
    active.map(async (entry) => {
      const result = await client.listPendingApprovals(entry.projectId);
      if (result.ok) counts.set(entry.projectId, result.value.length);
    }),
  );

  return counts;
}
