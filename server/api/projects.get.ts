/**
 * 上層のプロジェクト一覧。
 *
 * ブラウザはここだけを見る。本家へは触らせない（structure.md の Module Boundaries）。
 * 走査は要求されたときに行う。定期実行しない（tech.md の Performance Requirements）。
 */

import { defineEventHandler } from 'h3';

import { readServerConfig } from '../utils/config';
import { resolveDirectoryActions } from '../utils/control/actions';
import { buildProjectDirectory } from '../utils/control/directory';
import { readRegistry } from '../utils/upstream/registry';
import { scanProjects } from '../utils/upstream/scan';
import type { ProjectDirectoryResponse } from '#shared/types';

export default defineEventHandler(async (): Promise<ProjectDirectoryResponse> => {
  const config = readServerConfig();

  const [scan, registry] = await Promise.all([
    scanProjects(config.projectsParentPath),
    readRegistry(config.specWorkflowHome),
  ]);

  return {
    directory: buildProjectDirectory(scan, {
      entries: registry.status === 'ok' ? registry.entries : [],
      readable: registry.status === 'ok',
    }),
    actions: resolveDirectoryActions(),
  };
});
